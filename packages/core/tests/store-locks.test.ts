/**
 * Tests of the transaction gate and the duplicate rule under a lock of another process.
 *
 * #region moduleContract
 * @modulecontract
 * @purpose Prove the bounded lock wait, the single run of one change, and the duplicate rule across processes.
 * @scope The publish gate, the open, the concurrent writers, and the duplicate check of one note write.
 *  NOT: the redaction bytes.
 * @invariants Each holder of a lock is a child process, so no test waits on a lock of its own thread.
 * @invariants A child runs the library source, so a test needs no build.
 * @keywords test, lock, busy, transaction, duplicate, process
 * #endregion moduleContract
 */

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, describe, it } from "vitest";
import { note } from "../src/store/notes.js";
import { openDatabase, SCHEMA_VERSION } from "../src/store/schema.js";
import { Store } from "../src/store/store.js";
import { MemlensError } from "../src/types/errors.js";
import type { ScopeKey } from "../src/types/primitives.js";

const dirs: string[] = [];

afterAll(() => {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

/** @purpose Give a temporary directory for one store. */
function temp(): string {
	const dir = mkdtempSync(join(tmpdir(), "memlens-lock-"));
	dirs.push(dir);
	return dir;
}

/** @purpose Count the rows of one statement. */
function count(store: Store, sql: string, ...params: string[]): number {
	const row = store
		.handle()
		.prepare(sql)
		.get(...params);
	return Number(row?.c ?? 0);
}

/** @purpose Stop the thread of a test for a time, without a lock. */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// #region FUNC_test_child
/**
 * @purpose Hold one child process, so a test talks to it line by line.
 * @invariants Each output line arrives once, in the order of the child writes.
 * @invariants A child that ends without the wanted line gives a marker line, so a test fails fast.
 */
interface Child {
	next(): Promise<string>;
	go(): void;
	stop(): void;
	exited: Promise<number | null>;
}

/** @purpose Run one child script, and pipe its input and output to the test. */
function run(script: string): Child {
	const proc = spawn(
		process.execPath,
		["--experimental-transform-types", "--input-type=module", "-e", script],
		{ stdio: ["pipe", "pipe", "pipe"] },
	);
	const lines: string[] = [];
	const waiters: ((line: string) => void)[] = [];
	let buffer = "";
	proc.stdout?.setEncoding("utf8");
	proc.stdout?.on("data", (chunk: string) => {
		buffer += chunk;
		for (
			let index = buffer.indexOf("\n");
			index >= 0;
			index = buffer.indexOf("\n")
		) {
			const line = buffer.slice(0, index);
			buffer = buffer.slice(index + 1);
			const waiter = waiters.shift();
			if (waiter === undefined) lines.push(line);
			else waiter(line);
		}
	});
	const exited = new Promise<number | null>((resolve) => {
		proc.on("exit", (code) => {
			for (const waiter of waiters.splice(0)) waiter("<child exited>");
			resolve(code);
		});
	});
	return {
		next: () => {
			const line = lines.shift();
			if (line !== undefined) return Promise.resolve(line);
			return new Promise<string>((resolve) => waiters.push(resolve));
		},
		go: () => proc.stdin?.write("go\n"),
		stop: () => {
			proc.kill("SIGKILL");
		},
		exited,
	};
}

/** @purpose Run one child script that loads the library source, so the child needs no build. */
function runSource(script: string): Child {
	return run(SOURCE_PREAMBLE + script);
}

/** @purpose Name a child that holds the write lock of one store for a time, or until a kill. */
function holdScript(path: string, holdMs: number | null): string {
	const hold =
		holdMs === null
			? "setTimeout(() => {}, 30000);"
			: `setTimeout(() => { db.exec("ROLLBACK"); db.close(); }, ${holdMs});`;
	return `
		import { DatabaseSync } from "node:sqlite";
		const db = new DatabaseSync(${JSON.stringify(path)});
		db.exec("BEGIN IMMEDIATE");
		process.stdout.write("locked\\n");
		${hold}
`;
}

const INSERT_NOTE = `INSERT INTO notes (id, scope, pos, state, cleared, kind, body, longform, refs, ts, created_at, modified_at, v, v_content) VALUES (?, ?, 0, 'live', 0, 'note', ?, NULL, '[]', ?, ?, ?, 'v', 'v')`;

/** @purpose Name a child that writes one note row, and commits it after the parent starts a write. */
function insertScript(input: {
	path: string;
	id: string;
	scope: string;
	body: string;
	go: string;
	delayMs: number;
}): string {
	const ts = "2026-01-01T00:00:00.000Z";
	return `
	import { existsSync } from "node:fs";
	import { DatabaseSync } from "node:sqlite";
	const db = new DatabaseSync(${JSON.stringify(input.path)});
	db.exec("BEGIN IMMEDIATE");
	db.prepare(${JSON.stringify(INSERT_NOTE)}).run(
		${JSON.stringify(input.id)},
		${JSON.stringify(input.scope)},
		${JSON.stringify(input.body)},
		${JSON.stringify(ts)},
		${JSON.stringify(ts)},
		${JSON.stringify(ts)},
	);
	process.stdout.write("inserted\\n");
	const wait = () => {
		if (!existsSync(${JSON.stringify(input.go)})) {
			setTimeout(wait, 2);
			return;
		}
		setTimeout(() => {
			db.exec("COMMIT");
			db.close();
			process.exit(0);
		}, ${input.delayMs});
	};
	wait();
`;
}

/** The file URL of the library source, so a child process runs the source of this checkout. */
const CORE_ENTRY = pathToFileURL(
	fileURLToPath(new URL("../src/index.ts", import.meta.url)),
).href;

/**
 * @purpose Teach a child to load the TypeScript source, which the source imports as ".js".
 * @invariants Node strips and transforms the types. The hook maps each ".js" import to its ".ts" file.
 * @invariants The flag is required, because a constructor parameter property needs a transform.
 * @invariants The script imports the library after this preamble, because a static import runs first.
 */
const SOURCE_PREAMBLE = `
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
registerHooks({
	resolve(specifier, context, next) {
		if (specifier.endsWith(".js") && context.parentURL !== undefined) {
			const target = new URL(specifier.slice(0, -3) + ".ts", context.parentURL);
			if (target.protocol === "file:" && existsSync(fileURLToPath(target)))
				return { url: target.href, shortCircuit: true };
		}
		return next(specifier, context);
	},
});
`;

/** @purpose Name a child that writes one note through the public library entry, on a start signal. */
function writerScript(input: {
	dir: string;
	scope: string;
	body: string;
}): string {
	const noteInput = {
		scope: input.scope,
		kind: "note",
		body: input.body,
		session: "session",
		turn: "turn",
		preset: "preset",
	};
	return `
	const { note, Store } = await import(${JSON.stringify(CORE_ENTRY)});
	const store = new Store(${JSON.stringify(input.dir)});
	process.stdout.write("ready\\n");
	process.stdin.setEncoding("utf8");
	process.stdin.once("data", () => {
		const result = note(store, ${JSON.stringify(noteInput)});
		process.stdout.write((result.ok ? "ok" : "failed:" + String(result.reason)) + "\\n");
		store.close();
		process.exit(0);
	});
`;
}
// #endregion FUNC_test_child

/** @purpose Name the fields that each note write of these tests uses. */
const BASE = {
	scope: "p:locks" as ScopeKey,
	kind: "note" as const,
	session: "session",
	turn: "turn",
	preset: "preset",
};

// #region FUNC_test_publish_lock
/**
 * @purpose Prove that the gate waits for a lock of another process, and reports the change after it.
 */
describe("publish under a lock", () => {
	it("takes the lock when the other writer releases inside the budget", async () => {
		const dir = temp();
		const store = new Store(dir);
		const holder = run(holdScript(join(dir, "memlens.db"), 250));
		try {
			assert.equal(await holder.next(), "locked");
			const result = store.publish((tx) => tx.journal("test", null, null));
			assert.ok(result.version);
			assert.equal(count(store, "SELECT count(*) AS c FROM journal"), 1);
			assert.notEqual(store.rev(), "");
			assert.equal(await holder.exited, 0);
		} finally {
			store.close();
		}
	});

	it("reports a lock that outlasts the budget, and starts no change", async () => {
		const dir = temp();
		const store = new Store(dir);
		const holder = run(holdScript(join(dir, "memlens.db"), null));
		let runs = 0;
		try {
			assert.equal(await holder.next(), "locked");
			const started = Date.now();
			assert.throws(
				() =>
					store.publish(() => {
						runs += 1;
						return "value";
					}),
				(error: unknown) => {
					assert.ok(error instanceof MemlensError);
					assert.equal(error.code, "Data");
					assert.match(error.message, /locked/u);
					return true;
				},
			);
			const elapsed = Date.now() - started;
			assert.ok(elapsed >= 900, `the wait was too short: ${elapsed} ms`);
			assert.ok(elapsed <= 3000, `the wait was too long: ${elapsed} ms`);
			assert.equal(runs, 0);
			assert.equal(count(store, "SELECT count(*) AS c FROM journal"), 0);
			assert.equal(store.rev(), "");
		} finally {
			holder.stop();
			await holder.exited;
			store.close();
		}
	});
});
// #endregion FUNC_test_publish_lock

// #region FUNC_test_writers
/**
 * @purpose Prove that two real write processes keep both notes when they queue on one lock.
 * @invariants Each writer calls the public note write in its own process.
 */
describe("two writers", () => {
	it("keeps two notes of two processes that queue on one lock", async () => {
		const dir = temp();
		const store = new Store(dir);
		const bodies = [
			"Fact from the first writer.",
			"Fact from the second writer.",
		];
		const writers = bodies.map((body) =>
			runSource(writerScript({ dir, scope: BASE.scope, body })),
		);
		let holder: Child | undefined;
		try {
			// Each writer opens the store before the lock, so the open does not wait.
			assert.equal(await writers[0]?.next(), "ready");
			assert.equal(await writers[1]?.next(), "ready");
			holder = run(holdScript(join(dir, "memlens.db"), null));
			assert.equal(await holder.next(), "locked");
			for (const writer of writers) writer.go();
			// Both writers wait on the held lock, so the release finds two queued writes.
			await sleep(200);
			holder.stop();
			assert.deepEqual(
				await Promise.all(writers.map((writer) => writer.next())),
				["ok", "ok"],
			);
			for (const body of bodies)
				assert.equal(
					count(store, "SELECT count(*) AS c FROM notes WHERE body = ?", body),
					1,
				);
			assert.equal(count(store, "SELECT count(*) AS c FROM notes"), 2);
			for (const writer of writers) assert.equal(await writer.exited, 0);
		} finally {
			holder?.stop();
			for (const writer of writers) writer.stop();
			for (const writer of writers) await writer.exited;
			store.close();
		}
	});
});
// #endregion FUNC_test_writers

// #region FUNC_test_duplicate_lock
/**
 * @purpose Prove that the duplicate check sees a row that another process commits during the write.
 */
describe("duplicate under a lock", () => {
	it("checks the duplicate inside the write transaction of another process", async () => {
		const dir = temp();
		const path = join(dir, "memlens.db");
		const store = new Store(dir);
		const body = "A shared fact about locks.";
		const id = "01J0000000000000000000000A";
		const go = join(dir, "go");
		const child = run(
			insertScript({ path, id, scope: BASE.scope, body, go, delayMs: 300 }),
		);
		try {
			assert.equal(await child.next(), "inserted");
			writeFileSync(go, "1");
			const result = note(store, { ...BASE, body });
			assert.equal(result.ok, false);
			if (!result.ok) {
				assert.equal(result.reason, "duplicate");
				assert.equal(result.value?.id, id);
			}
			assert.equal(
				count(store, "SELECT count(*) AS c FROM notes WHERE body = ?", body),
				1,
			);
			assert.equal(store.rev(), "");
			assert.equal(await child.exited, 0);
		} finally {
			child.stop();
			await child.exited;
			store.close();
		}
	});
});
// #endregion FUNC_test_duplicate_lock

// #region FUNC_test_open_lock
/**
 * @purpose Prove that the open waits for a lock of another process, and applies its schema work once.
 */
describe("open under a lock", () => {
	it("opens a current store while another process holds the write lock", async () => {
		const dir = temp();
		const path = join(dir, "memlens.db");
		openDatabase(path, "en").close();
		const holder = run(holdScript(path, null));
		try {
			assert.equal(await holder.next(), "locked");
			const store = new Store(dir);
			try {
				assert.equal(count(store, "SELECT count(*) AS c FROM notes"), 0);
			} finally {
				store.close();
			}
		} finally {
			holder.stop();
			await holder.exited;
		}
	});

	it("opens a store of an older schema while another process holds the write lock", async () => {
		const dir = temp();
		const path = join(dir, "memlens.db");
		openDatabase(path, "en", []).close();
		const holder = run(holdScript(path, 300));
		try {
			assert.equal(await holder.next(), "locked");
			const db = openDatabase(path, "en");
			try {
				const version = db
					.prepare("SELECT value FROM meta WHERE key = 'schema_version'")
					.get();
				assert.equal(String(version?.value), String(SCHEMA_VERSION));
				const schema = db
					.prepare("SELECT sql FROM sqlite_master WHERE name = 'notes'")
					.get();
				assert.match(String(schema?.sql), /gotcha/u);
			} finally {
				db.close();
			}
			assert.equal(await holder.exited, 0);
		} finally {
			holder.stop();
			await holder.exited;
		}
	});
});
// #endregion FUNC_test_open_lock

// #region FUNC_test_commit
/**
 * @purpose Prove that the gate reports a commit that it cannot prove, and repeats no work.
 */
describe("commit failure", () => {
	it("reports an unknown commit result and repeats no work", () => {
		const dir = temp();
		const store = new Store(dir);
		try {
			let runs = 0;
			assert.throws(
				() =>
					store.publish((tx) => {
						runs += 1;
						tx.journal("test", null, null);
						// Close the transaction under the gate, so its commit finds no transaction.
						store.handle().exec("COMMIT");
						return "value";
					}),
				/unknown/u,
			);
			assert.equal(runs, 1);
			const next = store.publish((tx) => tx.journal("next", null, null));
			assert.ok(next.version);
			assert.equal(count(store, "SELECT count(*) AS c FROM journal"), 2);
		} finally {
			store.close();
		}
	});
});
// #endregion FUNC_test_commit

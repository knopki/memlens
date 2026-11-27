/**
 * Administrative commands.
 *
 * #region moduleContract
 * @modulecontract
 * @purpose Report and repair the state of one store, so a user trusts the memory or recovers it.
 * @scope
 *  - The commands status, check, repair, and journal.
 *  - NOT: the repair rules of the store and the exit code mapping.
 * @dependencies USES API: @memlens/core, commander; READS: the store directory
 * @keywords status, check, repair, journal, admin, cli
 * #endregion moduleContract
 */

import { debuglog } from "node:util";
import type { ScopeKey } from "@memlens/core";
import {
	check,
	dueRecords,
	type JournalRow,
	journalRows,
	liveCounts,
	normalizeScopeKey,
	nowIso,
} from "@memlens/core";
import type { Command } from "commander";
import {
	type CommandAnswer,
	type CommandIo,
	command,
	DRY_RUN,
	JSON_FLAG,
	limit,
	openCommandRuntime,
	print,
	type Run,
	reply,
	SCOPE,
	STORE,
} from "./commands.js";

const debug = debuglog("memlens:commands");

// #region FUNC_commands
/**
 * @purpose Declare the signature and the flags of each administrative command once, so the help
 *   comes from the same place as the parse.
 */
export function commands(run: Run): Command[] {
	const io = run.io;
	return [
		command("status", "Summarize the store.")
			.addOption(JSON_FLAG)
			.addOption(STORE)
			.action((options) => reply(run, statusCommand(options, io))),
		command("check", "Test the store against its derived state.")
			.addOption(JSON_FLAG)
			.addOption(STORE)
			.action((options) => reply(run, checkCommand(options, io))),
		command("repair", "Apply the planned repairs of one store.")
			.addOption(DRY_RUN)
			.addOption(STORE)
			.action((options) => reply(run, repairCommand(options, io))),
		command("journal", "Print the journal of the store.")
			.addOption(limit(20))
			.addOption(SCOPE)
			.addOption(JSON_FLAG)
			.addOption(STORE)
			.action((options) => reply(run, journalCommand(options, io))),
	];
}
// #endregion FUNC_commands

function liveTotal(counts: ReadonlyMap<string, number>): number {
	return [...counts.values()].reduce((sum, count) => sum + count, 0);
}

// #region FUNC_statusCommand
/**
 * Summarize the store.
 *
 * @purpose Give the path, the revision, and the record counts, so a user checks one store at a
 *   glance.
 */
export async function statusCommand(
	input: { json?: boolean; store?: string },
	io: CommandIo,
): Promise<string> {
	const runtime = await openCommandRuntime(io, input.store);
	try {
		const rev = runtime.store.rev();
		const counts = liveCounts(runtime.store);
		const status = {
			path: runtime.path,
			rev,
			scopes: counts.size,
			live: liveTotal(counts),
			due: dueRecords(runtime.store, runtime.scopes, nowIso()).length,
		};
		debug("Status answered", { event: "status", rev });
		return input.json
			? print(status)
			: Object.entries(status)
					.map(([key, value]) => `${key}: ${value}`)
					.join("\n");
	} finally {
		await runtime.close();
	}
}
// #endregion FUNC_statusCommand

// #region FUNC_checkCommand
/**
 * Test the store against its derived state.
 *
 * @purpose Report each mismatch between the state and the rows, so a user trusts the store or
 *   runs repair.
 * @invariants A store with a finding answers with the exit code 1.
 */
export async function checkCommand(
	input: { json?: boolean; store?: string },
	io: CommandIo,
): Promise<CommandAnswer> {
	const runtime = await openCommandRuntime(io, input.store);
	try {
		const findings = check(runtime.store, { dryRun: true });
		const counts = liveCounts(runtime.store);
		const report = {
			path: runtime.path,
			records: liveTotal(counts),
			scopes: counts.size,
			ok: findings.length === 0,
			findings: [...findings],
		};
		debug("Check answered", {
			event: "check",
			ok: report.ok,
			findings: findings.length,
		});
		const text = input.json
			? print(report)
			: [
					`path: ${report.path}`,
					`records: ${report.records}`,
					`scopes: ${report.scopes}`,
					...(report.ok ? ["ok"] : findings),
				].join("\n");
		return { text, code: report.ok ? 0 : 1 };
	} finally {
		await runtime.close();
	}
}
// #endregion FUNC_checkCommand

// #region FUNC_repairCommand
/**
 * Apply the planned repairs of one store.
 *
 * @purpose Drop the invalid and the empty node rows, rebuild the index on a drift, and prune the
 *   journal, so a user recovers a store whose caches do not match its rows.
 * @invariants The command changes no note row, writes no summary, and calls no model. The flag
 *   --dry-run lists the planned changes and writes nothing.
 */
export async function repairCommand(
	input: { dryRun?: boolean; store?: string },
	io: CommandIo,
): Promise<string> {
	const runtime = await openCommandRuntime(io, input.store);
	try {
		const dryRun = input.dryRun === true;
		const changes = check(runtime.store, { dryRun });
		debug("Repair done", { event: "repair", dryRun, changes: changes.length });
		return changes.length ? changes.join("\n") : "nothing to repair";
	} finally {
		await runtime.close();
	}
}
// #endregion FUNC_repairCommand

// #region FUNC_journalCommand
/**
 * Print the journal of the store.
 *
 * @purpose Show the newest journal events, so a user audits each change of the memory.
 */
export async function journalCommand(
	input: { limit: number; scope?: string; json?: boolean; store?: string },
	io: CommandIo,
): Promise<string> {
	const scope =
		input.scope === undefined
			? undefined
			: (normalizeScopeKey(input.scope) as ScopeKey);
	const runtime = await openCommandRuntime(io, input.store);
	try {
		const rows = journalRows(
			runtime.store,
			scope === undefined
				? { limit: input.limit }
				: { limit: input.limit, scope },
		);
		debug("Journal answered", { event: "journal", rows: rows.length });
		return input.json ? print(rows) : rows.map(renderJournalRow).join("\n");
	} finally {
		await runtime.close();
	}
}
// #endregion FUNC_journalCommand

/** Render one journal row as one line: the time, the operation, the target, the scope, the reason. */
function renderJournalRow(row: JournalRow): string {
	return [
		row.at,
		row.op,
		row.target ?? "-",
		row.scope ?? "-",
		row.reason ?? "-",
	].join("  ");
}

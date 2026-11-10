/**
 * #region moduleContract
 * @purpose Exercise independent writers and stop at an exact publication boundary without a production failpoint.
 * @invariants The stderr hook runs before backend imports. SIGKILL prevents cleanup after the marker.
 * #endregion moduleContract
 */

import { writeSync } from "node:fs";

const [backend, directory, action, marker] = process.argv.slice(2);
let armed = false;

// #region FUNC_capturePublication
/** @purpose Kill this process synchronously when debuglog emits the requested boundary. */
function capturePublication(chunk, encoding, callback) {
	const text = Buffer.isBuffer(chunk) ? chunk.toString() : String(chunk);
	writeSync(2, text);
	if (armed && marker && text.includes(marker))
		process.kill(process.pid, "SIGKILL");
	if (typeof encoding === "function") encoding();
	else if (callback) callback();
	return true;
}
// #endregion FUNC_capturePublication
process.stderr.write = capturePublication;

const { SqliteStore } = await import("../../dist/storage/sqlite.js");
const { JsonlStore } = await import("../../dist/storage/jsonl.js");
const Store = backend === "sqlite" ? SqliteStore : JsonlStore;
const store = new Store(directory);
await store.projection();
const start = new Promise((resolve) => process.once("message", resolve));
process.send("ready");
await start;
armed = true;
if (action.startsWith("redact:")) {
	await store.append({
		op: "redact",
		scope: "project:a",
		target: action.slice(7),
		reason: "erase",
	});
} else
	await store.append({
		op: "note",
		scope: "project:a",
		body: action,
		kind: "note",
		ts: "2026-11-10T00:00:00.000Z",
		review_at: null,
		session: "subprocess",
		turn: action,
		preset: "test",
	});
await store.close();
process.disconnect();

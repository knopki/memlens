/**
 * Administrative commands.
 *
 * #region moduleContract
 * @modulecontract
 * @purpose Report and repair the state of one store, so a user trusts the memory or recovers it.
 * @scope
 *  - The commands status, check, repair, and journal.
 *  - NOT: the repair rules of the store and the exit code mapping.
 * @dependencies USES API: @memlens/core; READS: the store directory
 * @keywords status, check, repair, journal, admin, cli
 * #endregion moduleContract
 */

import { debuglog } from "node:util";
import {
	check,
	dueRecords,
	type JournalRow,
	journalRows,
	liveCounts,
	nowIso,
} from "@memlens/core";
import type { ParsedArgs } from "./args.js";
import {
	type CommandAnswer,
	type CommandIo,
	countFlag,
	isJson,
	openCommandRuntime,
	print,
	scopeList,
} from "./commands.js";

const debug = debuglog("memlens:commands");

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
	args: ParsedArgs,
	io: CommandIo,
): Promise<string> {
	const runtime = await openCommandRuntime(args, io);
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
		return isJson(args.flags)
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
	args: ParsedArgs,
	io: CommandIo,
): Promise<CommandAnswer> {
	const runtime = await openCommandRuntime(args, io);
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
		const text = isJson(args.flags)
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
	args: ParsedArgs,
	io: CommandIo,
): Promise<string> {
	const runtime = await openCommandRuntime(args, io);
	try {
		const dryRun = args.flags["dry-run"] === true;
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
	args: ParsedArgs,
	io: CommandIo,
): Promise<string> {
	const limit = countFlag(args.flags, "limit", 20);
	const scope = scopeList(args.flags)[0];
	const runtime = await openCommandRuntime(args, io);
	try {
		const rows = journalRows(
			runtime.store,
			scope ? { limit, scope } : { limit },
		);
		debug("Journal answered", { event: "journal", rows: rows.length, limit });
		return isJson(args.flags)
			? print(rows)
			: rows.map(renderJournalRow).join("\n");
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

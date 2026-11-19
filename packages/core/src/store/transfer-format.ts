/**
 * #region moduleContract
 * @modulecontract
 * @purpose Read and write the portable note text of one transfer file, so an import validates the whole file first.
 * @scope The JSONL header, note line, and trailer; the field parsers; the row shapes.
 *  NOT: the merge channels and the write of the store.
 * @dependencies USES API: node:crypto
 * @keywords transfer, jsonl, export, parse, digest, row, tombstone, header, trailer
 * #endregion moduleContract
 */

import { createHash } from "node:crypto";
import { debuglog } from "node:util";
import { MemlensError } from "../types/errors.js";
import {
	NOTE_KINDS,
	type NoteKind,
	type ScopeKey,
} from "../types/primitives.js";
import { nullable } from "./rows.js";
import type { NoteState } from "./types.js";

const debug = debuglog("memlens:transfer");

/** The format number of this transfer build. */
export const FORMAT = 1;

/** The greatest count of note lines that one file may hold. */
const MAX_ROWS = 200_000;

const STATES: readonly NoteState[] = ["live", "hidden", "deleted"];

/** One note with every field of the table, in JSON form. */
export interface Row {
	id: string;
	scope: ScopeKey;
	ts: string;
	state: NoteState;
	cleared: boolean;
	kind: NoteKind;
	body: string;
	longform: string | null;
	refs: string[];
	superseded_by: string | null;
	session: string;
	turn: string;
	preset: string;
	review_at: string | null;
	reviewed_at: string | null;
	created_at: string;
	modified_at: string;
	v: string;
	v_content: string;
	v_review: string | null;
}

/** One note row of the local table with its rowid and slot. */
export interface LocalRow extends Row {
	n: number;
	pos: number;
}

/** One parsed note line. A tombstone line holds no content. */
export interface ParsedRow {
	row: Row;
	tombstone: boolean;
}

/** One validated file. */
interface ParsedFile {
	rows: ParsedRow[];
	versions: string[];
}

// #region FUNC_rowLine
/**
 * @purpose Render one note row as one JSONL line with a stable field order.
 * @invariants A tombstone holds id, scope, ts, state, cleared, and the three versions only.
 * @invariants A full row keeps a null longform as null.
 */
export function rowLine(row: Record<string, unknown>): string {
	const id = String(row.id);
	const scope = String(row.scope);
	const ts = String(row.ts);
	const state = String(row.state) as NoteState;
	const cleared = Number(row.cleared) === 1;
	const v = String(row.v);
	const vContent = String(row.v_content);
	const vReview = nullable(row.v_review);
	if (state === "deleted" || cleared)
		return JSON.stringify({
			id,
			scope,
			ts,
			state,
			cleared,
			v,
			v_content: vContent,
			v_review: vReview,
		});
	return JSON.stringify({
		id,
		scope,
		ts,
		state,
		cleared,
		kind: String(row.kind),
		body: String(row.body),
		longform: nullable(row.longform),
		refs: refsOfRow(row.refs),
		superseded_by: nullable(row.superseded_by),
		session: String(row.session),
		turn: String(row.turn),
		preset: String(row.preset),
		review_at: nullable(row.review_at),
		reviewed_at: nullable(row.reviewed_at),
		created_at: String(row.created_at),
		modified_at: String(row.modified_at),
		v,
		v_content: vContent,
		v_review: vReview,
	});
}
// #endregion FUNC_rowLine

// #region FUNC_parseTransfer
/**
 * @purpose Read and validate the complete file before the store sees one write.
 * @invariants The header names format 1. The trailer count and digest must match the note lines.
 * @invariants One file holds at most 200000 note lines and no duplicate id.
 * @returns The note rows in file order, and each version that the clock must receive.
 */
export function parseTransfer(input: readonly string[]): ParsedFile {
	const lines = [...input];
	while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
	if (lines.length < 2)
		throw new MemlensError(
			"Data",
			"The transfer file has no header and trailer.",
		);
	const header = parseObject(lines[0], "header");
	if (header.format !== FORMAT)
		throw new MemlensError("Data", `The transfer format is not ${FORMAT}.`);
	const trailer = parseObject(lines[lines.length - 1], "trailer");
	const noteLines = lines.slice(1, -1);
	if (noteLines.length > MAX_ROWS)
		throw new MemlensError(
			"Data",
			`The transfer file holds more than ${MAX_ROWS} note lines.`,
		);
	verifyTrailer(lines, trailer, noteLines.length);
	const rows = parseRows(noteLines);
	debug("Transfer parsed", { event: "parse", rows: rows.length });
	return { rows, versions: versionsOf(header, rows) };
}
// #endregion FUNC_parseTransfer

// #region FUNC_verifyTrailer
/** @purpose Refuse a trailer whose digest or count does not match the note lines. */
function verifyTrailer(
	lines: readonly string[],
	trailer: Record<string, unknown>,
	count: number,
): void {
	if (
		typeof trailer.digest !== "string" ||
		trailer.digest !== digestOf(lines.slice(0, -1))
	)
		throw new MemlensError(
			"Data",
			"The transfer digest does not match the lines.",
		);
	if (Number(trailer.count) !== count)
		throw new MemlensError(
			"Data",
			"The transfer count does not match the note lines.",
		);
}
// #endregion FUNC_verifyTrailer

// #region FUNC_parseRows
/** @purpose Read each note line, and refuse a duplicate id. */
function parseRows(noteLines: readonly string[]): ParsedRow[] {
	const rows: ParsedRow[] = [];
	const ids = new Set<string>();
	for (const line of noteLines) {
		const row = parseRow(parseObject(line, "note"));
		if (ids.has(row.id))
			throw new MemlensError(
				"Data",
				"The transfer file holds duplicate note ids.",
			);
		ids.add(row.id);
		rows.push({ row, tombstone: row.state === "deleted" || row.cleared });
	}
	return rows;
}
// #endregion FUNC_parseRows

// #region FUNC_versionsOf
/** @purpose Collect each version text that the clock must receive. */
function versionsOf(
	header: Record<string, unknown>,
	rows: readonly ParsedRow[],
): string[] {
	const versions: string[] = [];
	if (typeof header.version === "string") versions.push(header.version);
	for (const { row } of rows) {
		versions.push(row.v, row.v_content);
		if (row.v_review !== null) versions.push(row.v_review);
	}
	return versions;
}
// #endregion FUNC_versionsOf

// #region FUNC_parseRow
/**
 * @purpose Read one JSON object as a note with the field limits of the table.
 * @invariants A missing content field takes the default of a tombstone.
 * @invariants A cleared row must be deleted, as the table constraint requires.
 * @invariants An absent kind gives `note`, an absent cleared flag gives false, and absent refs give
 *   no ref. An absent text gives the empty text, and an absent date gives the row ts.
 */
function parseRow(value: Record<string, unknown>): Row {
	const base = {
		id: requiredText(value.id, "id"),
		scope: requiredText(value.scope, "scope") as ScopeKey,
		ts: requiredText(value.ts, "ts"),
		state: parseState(value.state),
		cleared: parseCleared(value.cleared),
		v: requiredText(value.v, "v"),
		v_content: requiredText(value.v_content, "v_content"),
		v_review: optionalText(value.v_review),
	};
	if (base.cleared && base.state !== "deleted")
		throw new MemlensError("Data", "A cleared note must be deleted.");
	return base.state === "deleted" || base.cleared
		? tombstoneRow(base)
		: contentRow(base, value);
}
// #endregion FUNC_parseRow

// #region FUNC_tombstoneRow
/** @purpose Give the stored shape of a row without content. */
function tombstoneRow(base: {
	readonly id: string;
	readonly scope: ScopeKey;
	readonly ts: string;
	readonly v: string;
	readonly v_content: string;
	readonly v_review: string | null;
}): Row {
	return {
		id: base.id,
		scope: base.scope,
		ts: base.ts,
		state: "deleted",
		cleared: true,
		kind: "note",
		body: "",
		longform: null,
		refs: [],
		superseded_by: null,
		session: "",
		turn: "",
		preset: "",
		review_at: null,
		reviewed_at: null,
		created_at: base.ts,
		modified_at: base.ts,
		v: base.v,
		v_content: base.v_content,
		v_review: base.v_review,
	};
}
// #endregion FUNC_tombstoneRow

// #region FUNC_contentRow
/** @purpose Give the stored shape of a row with its content fields. */
function contentRow(
	base: {
		readonly id: string;
		readonly scope: ScopeKey;
		readonly ts: string;
		readonly state: NoteState;
		readonly v: string;
		readonly v_content: string;
		readonly v_review: string | null;
	},
	value: Record<string, unknown>,
): Row {
	return {
		...base,
		cleared: false,
		kind: parseKind(value.kind),
		body: optionalText(value.body) ?? "",
		longform: optionalText(value.longform),
		refs: refsOfInput(value.refs),
		superseded_by: optionalText(value.superseded_by),
		session: optionalText(value.session) ?? "",
		turn: optionalText(value.turn) ?? "",
		preset: optionalText(value.preset) ?? "",
		review_at: optionalText(value.review_at),
		reviewed_at: optionalText(value.reviewed_at),
		created_at: optionalText(value.created_at) ?? base.ts,
		modified_at: optionalText(value.modified_at) ?? base.ts,
	};
}
// #endregion FUNC_contentRow

// #region FUNC_digestOf
/** @purpose Hash the text of the given lines, so a trailer states the content of the file. */
export function digestOf(lines: readonly string[]): string {
	return createHash("sha256").update(lines.join("\n")).digest("hex");
}
// #endregion FUNC_digestOf

// #region FUNC_parseObject
/** @purpose Read one JSON line as an object. */
function parseObject(
	text: string | undefined,
	role: string,
): Record<string, unknown> {
	let value: unknown;
	try {
		value = JSON.parse(text ?? "");
	} catch {
		throw new MemlensError("Data", `The transfer ${role} is not JSON.`);
	}
	if (value === null || typeof value !== "object" || Array.isArray(value))
		throw new MemlensError("Data", `The transfer ${role} is not an object.`);
	return value as Record<string, unknown>;
}
// #endregion FUNC_parseObject

function requiredText(value: unknown, name: string): string {
	if (typeof value !== "string" || value.length === 0)
		throw new MemlensError("Data", `A note needs a text ${name}.`);
	return value;
}

function optionalText(value: unknown): string | null {
	if (value === undefined || value === null) return null;
	if (typeof value !== "string")
		throw new MemlensError("Data", "A note text field is not text.");
	return value;
}

function parseCleared(value: unknown): boolean {
	if (value === undefined || value === null) return false;
	if (value === true || value === 1) return true;
	if (value === false || value === 0) return false;
	throw new MemlensError("Data", "A cleared flag is not a boolean.");
}

function parseState(value: unknown): NoteState {
	if (typeof value === "string" && STATES.includes(value as NoteState))
		return value as NoteState;
	throw new MemlensError("Data", "A note state is not known.");
}

function parseKind(value: unknown): NoteKind {
	if (value === undefined || value === null) return "note";
	if (typeof value === "string" && NOTE_KINDS.includes(value as NoteKind))
		return value as NoteKind;
	throw new MemlensError("Data", "A note kind is not known.");
}

function refsOfInput(value: unknown): string[] {
	if (value === undefined || value === null) return [];
	return textRefs(value, "The refs of a note are not text.");
}

// #region FUNC_refsOfRow
/** @purpose Read the refs text of one stored row, and refuse a damaged cell. */
export function refsOfRow(value: unknown): string[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(String(value ?? "[]"));
	} catch {
		throw new MemlensError("Data", "A note row holds invalid refs.");
	}
	return textRefs(parsed, "A note row holds invalid refs.");
}
// #endregion FUNC_refsOfRow

function textRefs(value: unknown, message: string): string[] {
	if (!Array.isArray(value) || value.some((item) => typeof item !== "string"))
		throw new MemlensError("Data", message);
	return [...value];
}

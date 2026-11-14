/**
 * Markdown export format.
 *
 * #region moduleContract
 * @modulecontract
 * @purpose Give each exported scope one readable Markdown file with a safe filename, so a human
 *   reads the memory outside the tool.
 * @scope
 *  - The scope filename encoding, the file header, and one section for each record.
 *  - NOT: an import of Markdown, node rows, or the JSONL transfer format.
 * @invariants The format is export-only: a rebuild gives the tree, so the export holds no node row.
 * @usecases
 *  - Export: caller => gives one scope and its records => gets one Markdown text
 * @dependencies USES API: @memlens/core
 * @keywords export, markdown, md, filename, encoding, scope, record
 * #endregion moduleContract
 */

import { debuglog } from "node:util";
import type { Note, ScopeKey } from "@memlens/core";

/** One exported record: a note row and its supersede targets. */
interface MarkdownRecord extends Note {
	readonly supersedes?: readonly string[];
}

const debug = debuglog("memlens:export-md");

/** The format marker of the first block of each file. */
const MD_FORMAT = "memlens-md-1";

// #region FUNC_encodeScopeFilename
/**
 * Encode one scope key into one safe filename stem.
 *
 * @purpose Map each normalized scope key to one distinct filename, so the export writes no path
 *   outside the export directory.
 * @invariants The encoding keeps a-z, 0-9, underscore, and hyphen. Every other UTF-8 byte of the
 *   key becomes %HH with uppercase digits, and the name ends with .md.
 */
export function encodeScopeFilename(scope: ScopeKey): string {
	const kept = /^[a-z0-9_-]+$/;
	const bytes: string[] = [];
	for (const byte of Buffer.from(scope, "utf8")) {
		const char = String.fromCharCode(byte);
		bytes.push(
			kept.test(char)
				? char
				: `%${byte.toString(16).toUpperCase().padStart(2, "0")}`,
		);
	}
	const name = `${bytes.join("")}.md`;
	debug("Scope name encoded", { event: "encode", scope, name });
	return name;
}
// #endregion FUNC_encodeScopeFilename

// #region FUNC_renderScopeMarkdown
/**
 * Render one scope and its records as one Markdown text.
 *
 * @purpose Give the human view of one scope, so the export needs no store open.
 * @invariants The header holds the scope key and the format marker. The records appear in
 *   position order. Each record is one section ## #<pos> with a YAML block and its body, and a
 *   longform follows under ### longform. The render writes live records only, so it writes no
 *   hidden, deleted, or cleared record. The same records give the same text.
 */
export function renderScopeMarkdown(
	scope: ScopeKey,
	records: readonly MarkdownRecord[],
): string {
	const head = `---\nscope: ${yamlScalar(scope)}\nformat: ${MD_FORMAT}\n---\n`;
	const sections = records
		.filter((record) => record.state === "live" && !record.cleared)
		.map(renderRecord)
		.join("\n");
	debug("Scope rendered", { event: "render", scope, records: records.length });
	return `${head}\n${sections}`;
}
// #endregion FUNC_renderScopeMarkdown

function renderRecord(record: MarkdownRecord): string {
	const block = [
		`id: ${yamlScalar(record.id)}`,
		`at: ${yamlScalar(record.created_at)}`,
		`ts: ${yamlScalar(record.ts)}`,
		`kind: ${record.kind}`,
		`review_at: ${record.review_at === null ? "null" : yamlScalar(record.review_at)}`,
		`refs: ${yamlList(record.refs)}`,
		`supersedes: ${yamlList(record.supersedes ?? [])}`,
	]
		.map((line) => `  ${line}`)
		.join("\n");
	const longform =
		record.longform === null ? "" : `\n### longform\n\n${record.longform}\n`;
	return `## #${record.pos}\n\n\`\`\`yaml\n${block}\n\`\`\`\n\n${record.body}\n${longform}`;
}

/** Quote one YAML scalar only when its text needs it. */
function yamlScalar(value: string): string {
	return /^[-A-Za-z0-9_.:/ ]+$/.test(value) ? value : JSON.stringify(value);
}

/** Render one YAML flow list of scalars. */
function yamlList(values: readonly string[]): string {
	if (values.length === 0) return "[]";
	return `[${values.map((value) => yamlScalar(value)).join(", ")}]`;
}

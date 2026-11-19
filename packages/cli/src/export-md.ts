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

import { createHash } from "node:crypto";
import { debuglog } from "node:util";
import type { Note, ScopeKey } from "@memlens/core";

/** One exported record: a note row and its supersede targets. */
interface MarkdownRecord extends Note {
	readonly supersedes?: readonly string[];
}

const debug = debuglog("memlens:export-md");

/** The format marker of the first block of each file. */
const MD_FORMAT = "memlens-md-1";

/** The byte limit of one file name on the common file systems. */
const FILENAME_LIMIT = 255;

/** The room for one suffix after the stem, so the longest suffix fits the byte limit. */
const SUFFIX_ROOM = ".jsonl".length;

// #region FUNC_encodeScopeFilename
/**
 * Encode one scope key into one safe filename stem.
 *
 * @purpose Map each normalized scope key to one distinct filename, so the export writes no path
 *   outside the export directory.
 * @invariants The encoding keeps a-z, 0-9, underscore, and hyphen. Every other UTF-8 byte of the
 *   key becomes %HH with uppercase digits, and the name ends with .md.
 * @invariants The stem stays within the byte limit minus the suffix room. A stem above the limit
 *   cuts to its head, and the head ends with one tilde and eight hash characters of the full
 *   stem, so two long keys give two distinct files.
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
	const stem = stemWithinLimit(bytes.join(""));
	const name = `${stem}.md`;
	debug("Scope name encoded", { event: "encode", scope, name });
	return name;
}
// #endregion FUNC_encodeScopeFilename

function stemWithinLimit(stem: string): string {
	if (stem.length <= FILENAME_LIMIT - SUFFIX_ROOM) return stem;
	const hash = createHash("sha1").update(stem).digest("hex").slice(0, 8);
	let head = stem.slice(0, FILENAME_LIMIT - SUFFIX_ROOM - hash.length - 1);
	// A cut inside one %HH triplet leaves a broken tail, so step back to the last full byte.
	while (/%$|%[0-9A-F]$/.test(head)) head = head.slice(0, -1);
	return `${head}~${hash}`;
}

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

function yamlScalar(value: string): string {
	return /^[-A-Za-z0-9_.:/ ]+$/.test(value) ? value : JSON.stringify(value);
}

function yamlList(values: readonly string[]): string {
	if (values.length === 0) return "[]";
	return `[${values.map((value) => yamlScalar(value)).join(", ")}]`;
}

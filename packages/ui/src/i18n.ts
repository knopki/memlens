/**
 * #region moduleContract
 * @purpose Give every console screen one message table per language, so a human reads the console
 * in a language of the DSH set.
 * @scope Message text, the language list, and the placeholder fill. NOT: the screens, the state, or
 * the store.
 * @invariants Every language holds every key of the English table. A missing language gives English.
 * No message holds markup: the client puts each text into a text node.
 * @dependencies No import. The client owns the screens that read these messages.
 * @keywords console, language, locale, translation, message, text
 * #endregion moduleContract
 */

/** The language codes of the DSH set, in the order of the language list. */
export const LANGS = ["de", "en", "es", "fr", "ja", "pt", "ru", "zh"] as const;
/** One language code. */
export type Lang = (typeof LANGS)[number];

/** The name of each language in its own words. */
export const LANG_NAMES: Readonly<Record<Lang, string>> = {
	de: "Deutsch",
	en: "English",
	es: "Español",
	fr: "Français",
	ja: "日本語",
	pt: "Português",
	ru: "Русский",
	zh: "中文",
};

// #region BLOCK_english
/** The English messages. This table is the key set of every other language. */
const en = {
	// The chrome.
	title: "memlens · memory console",
	skip: "Skip to content",
	screens: "Screens",
	scopes: "Scopes",
	profile: "Profile",
	language: "Language",
	theme: "Theme",
	themeSystem: "System",
	themeLight: "Light",
	themeDark: "Dark",
	backend: "Backend",
	dirty: "Dirty",
	store: "Store",
	revision: "Revision",
	newRecord: "New record",
	lines: "{used} / {limit} lines",
	// The screens.
	nav0: "Overview",
	nav1: "Tree",
	nav2: "Catalog",
	nav3: "Search",
	nav4: "Review",
	nav5: "Proposals",
	nav6: "Maintenance",
	ovText:
		"The notes and the tree above them. Choose a scope in the rail to open its frontier.",
	openScope: "Open scope",
	noFrontier: "No live notes.",
	live: "live",
	hidden: "hidden",
	deleted: "deleted",
	slice: "Assembled slice",
	treeText:
		"The frontier of this scope. A range line opens its two children, a note opens its record.",
	frontier: "Frontier",
	frontierMeta: "{ranges} ranges · {live} live notes",
	clean: "summary",
	pending: "summary pending",
	record: "note",
	inspector: "Inspector",
	selectLine: "Select a line.",
	children: "Children",
	noSummary: "No summary yet.",
	notBuilt: "no summary yet",
	id: "id",
	time: "time",
	kind: "kind",
	session: "session",
	preset: "preset",
	refs: "refs",
	supersedes: "supersedes",
	supersededBy: "superseded by",
	reviewAt: "review",
	none: "none",
	copyId: "Copy the id",
	openInTree: "Open in the tree",
	actReviewed: "Reviewed",
	actAmend: "Amend",
	actSupersede: "Supersede",
	actForget: "Forget",
	actDelete: "Delete",
	confirmForget: "Forget {target}?",
	confirmDelete: "Erase the content of {target}?",
	catText:
		"A line for each range of visible scopes. The directions budget limits the catalog lines.",
	catLines: "Catalog lines",
	catNodes: "Catalog nodes",
	emptyCatalog: "The catalog is empty.",
	range: "Range",
	dates: "Dates",
	chars: "Chars",
	state: "State",
	searchText: "Find notes by words. The words match the note body.",
	find: "Find",
	allScopes: "All scopes",
	allKinds: "All kinds",
	scope: "scope",
	kindLabel: "kind",
	since: "since",
	limit: "limit",
	matches: "{count} matches",
	noMatches: "No matches.",
	searchHint: "Enter words and press Find.",
	revText: "The notes with a review date of today or earlier.",
	due: "Due",
	address: "Address",
	text: "Text",
	reviewDate: "Review date",
	actions: "Actions",
	reviewPeriods: "Review periods",
	days: "{count} days",
	propText:
		"A proposal waits for a human. Accept writes the operation by the ordinary rules. Dismiss closes the proposal and changes no record.",
	waiting: "Waiting",
	decision: "Decision",
	accept: "Accept",
	dismiss: "Dismiss",
	maintText:
		"The tree is a cache over the log. A compaction job publishes summary nodes.",
	records: "Records",
	treeNodes: "Tree nodes",
	mergeCandidates: "Merge candidates",
	lineBudgets: "Line budgets",
	level: "Level",
	nodes: "Nodes",
	candidates: "Candidates",
	ready: "ready",
	waits: "waits for the second child",
	nodesByLevel: "Nodes by level",
	compaction: "Compaction",
	prepareScope: "Prepare a scope job",
	prepareCatalog: "Prepare a catalog job",
	noInputsCatalog: "No merge input. A scope has no top node yet.",
	noInputs: "No merge input. Every dirty range waits for its second child.",
	mergeTasks: "Merge tasks",
	answers: "Answers",
	answersHint: "#0-1: one line for each range",
	applyAnswers: "Apply the answers",
	built: "Built {built} summaries and rejected {rejected}.",
	rejectedRanges: "Rejected ranges: {ranges}. Prepare the job again.",
	copy: "Copy",
	// The record dialog.
	newTitle: "New record",
	amendTitle: "Amend note",
	body: "Body · one line",
	longform: "Longform document",
	scopeField: "Scope",
	kindField: "Kind",
	supersedesField: "Supersedes · comma-separated addresses",
	newScopeHint: "A new scope starts with this note.",
	characters: "{count} characters",
	cancel: "Cancel",
	create: "Create record",
	save: "Save changes",
	// The answers of the screen.
	loading: "Loading…",
	saving: "Saving…",
	saved: "Saved.",
	copied: "Copied.",
	busyAction: "Another action is in progress.",
	enterAnswers: "Enter the answers.",
	kindDecision: "decision",
	kindPreference: "preference",
	kindFact: "fact",
	kindTask: "task",
	kindNote: "note",
};

// #endregion BLOCK_english

import { de } from "./lang/de.js";
import { es } from "./lang/es.js";
import { fr } from "./lang/fr.js";
import { ja } from "./lang/ja.js";
import { pt } from "./lang/pt.js";
import { ru } from "./lang/ru.js";
import { zh } from "./lang/zh.js";

/** One message table: every key of the English table. */
export type Table = Readonly<Record<keyof typeof en, string>>;

// #region BLOCK_tables
/** The messages of each language. */
export const MESSAGES: Readonly<Record<Lang, Table>> = {
	en,
	de,
	es,
	fr,
	ja,
	pt,
	ru,
	zh,
};
// #endregion BLOCK_tables

// #region FUNC_messages
/**
 * @purpose Give the table of one language with the English fallback.
 * @invariants An unknown code gives English. A missing key gives the English text.
 */
export function messages(code: string): Table {
	const lang = (code.slice(0, 2) as Lang) ?? "en";
	const table = MESSAGES[lang];
	if (!table) return en;
	return table;
}
// #endregion FUNC_messages

// #region FUNC_fill
/**
 * @purpose Replace each {name} placeholder in one message.
 * @invariants An absent value keeps the placeholder out of the text and writes nothing.
 */
export function fill(
	text: string,
	values: Record<string, string | number>,
): string {
	return text.replace(/\{(\w+)\}/g, (_, name: string) =>
		name in values ? String(values[name]) : "",
	);
}
// #endregion FUNC_fill

/** The kind labels of the note kinds. */
export const KIND_KEYS = {
	decision: "kindDecision",
	preference: "kindPreference",
	fact: "kindFact",
	task: "kindTask",
	note: "kindNote",
} as const satisfies Record<string, keyof typeof en>;

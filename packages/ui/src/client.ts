/**
 * #region moduleContract
 * @purpose Let a human read the memory and maintain it from seven console screens in one of the
 * eight languages of the DSH set.
 * @scope Native DOM controls, the language and theme choice, and the local HTTP API. NOT: the store
 * rules, the slice, and the tree.
 * @invariants
 *  - Put each store text into a text node. Keep a destructive action behind a confirmation.
 *    Show no state that this host does not hold.
 *  - The tree screen shows the frontier of the model, so a range line and the notes inside that
 *    range never appear together.
 *  - The theme choice is light, dark, or system, and it survives a reload.
 *  - A status message and a load state float above the screens and never move them. An open form
 *    takes the message in its own row. The message clears itself, and an error stays longer than a
 *    success.
 * @dependencies GET view, search, open and POST action from the CLI host. i18n.ts for the text.
 * @keywords console, ui, screen, theme, language, frontier, search, review, proposal, compaction
 * #endregion moduleContract
 */

import type { ConsoleModel } from "../../core/src/domain/console.js";
import type {
	OpenChildren,
	OpenEntry,
	OpenLine,
} from "../../core/src/domain/reads.js";
import type {
	Event as MemoryEvent,
	NoteKind,
} from "../../core/src/types/events.js";
import type { ProjectionRecord } from "../../core/src/types/projection.js";
import type { IndexHit } from "../../core/src/types/store.js";
import type {
	BuildInput,
	Range,
	SliceLine,
} from "../../core/src/types/tree.js";
import {
	fill,
	KIND_KEYS,
	LANG_NAMES,
	LANGS,
	type Lang,
	messages,
	type Table,
} from "./i18n.js";

type View = ConsoleModel & {
	profiles: string[];
	path: string;
	backend: string;
	allowDelete: boolean;
	reviewPolicy: Record<NoteKind, number>;
	proposals: MemoryEvent[];
};
type Job = {
	inputs: BuildInput[];
	job: string;
	catalog: boolean;
	profile: string;
	scope: string;
};
type Selection = { target: string; result: OpenEntry | OpenChildren };
type Choice = "system" | "light" | "dark";

const KINDS = ["decision", "preference", "fact", "task", "note"] as const;
const ICONS = [
	"M2 3h12M2 8h12M2 13h7",
	"M8 14V9M8 9L4 6M8 9l4-3M4 6V3M12 6V3",
	"M2 12l3-5 3 2 3-6 3 3",
	"M10.2 10.2L14 14M6 3a4.2 4.2 0 100 8.4A4.2 4.2 0 006 3z",
	"M3 8l3 3 7-7",
	"M3 4h10M3 8h10M3 12h6",
	"M2 8h3l2-4 2 8 2-4h3",
];
const state = {
	model: undefined as View | undefined,
	profile: "",
	scope: "",
	screen: 0,
	lang: "en" as Lang,
	theme: "system" as Choice,
	busy: false,
	generation: 0,
	selection: undefined as Selection | undefined,
	hits: [] as readonly IndexHit[],
	query: "",
	kind: "",
	since: "",
	limit: "10",
	searchScope: "",
	job: undefined as Job | undefined,
	jobError: "",
};
const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Console root is absent");
const status = el("div");
status.id = "status";
status.setAttribute("role", "status");
status.setAttribute("aria-live", "polite");
const shell = el("div", "", "shell");
app.append(status, shell);
const chosen = (key: string, fallback: string) => {
	try {
		return localStorage.getItem(key) ?? fallback;
	} catch {
		return fallback;
	}
};
state.lang = language(chosen("memlens.lang", navigator.language));
state.theme = theme(chosen("memlens.theme", "system"));
let table: Table = messages(state.lang);

// #region BLOCK_helpers
function el<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	text = "",
	className = "",
): HTMLElementTagNameMap[K] {
	const node = document.createElement(tag);
	node.textContent = text;
	node.className = className;
	return node;
}
const tr = (key: keyof Table, values: Record<string, string | number> = {}) =>
	fill(table[key], values);
function append(parent: HTMLElement, ...children: HTMLElement[]) {
	parent.append(...children);
	return parent;
}
function btn(text: string, fn: () => unknown, className = "") {
	const node = el("button", text, `btn ${className}`.trim());
	node.type = "button";
	node.addEventListener("click", () => run(fn));
	return node;
}
function input(value = "", type = "text") {
	const node = el("input");
	node.type = type;
	node.value = value;
	return node;
}
function select(values: readonly string[], value: string, label?: string) {
	const node = el("select");
	for (const item of values) {
		const option = el("option", label && !item ? label : item, "");
		option.value = item;
		node.append(option);
	}
	node.value = value;
	return node;
}
function field(text: string, control: HTMLElement) {
	const wrap = el("div", "", "field");
	const label = el("label", text);
	label.append(control);
	wrap.append(label);
	return wrap;
}
function pill(label: string, value: HTMLElement | string, warn = false) {
	const node = el("span", "", warn ? "pill warn" : "pill");
	node.append(
		el("span", label, "k"),
		typeof value === "string" ? el("b", value) : value,
	);
	return node;
}
function panel(title: string, right = "") {
	const node = el("section", "", "panel");
	const head = el("div", "", "head");
	head.append(el("span", title, "t"));
	if (right) head.append(el("span", right, "r"));
	node.append(head);
	return node;
}
function kv(rows: [string, string][]) {
	const node = el("div", "", "kv");
	for (const [key, value] of rows) node.append(el("b", key), el("span", value));
	return node;
}
function tableOf(headers: string[], rows: (string | HTMLElement)[][]) {
	const wrap = el("div", "", "table-wrap");
	const node = el("table");
	const head = el("tr");
	for (const name of headers) head.append(el("th", name));
	node.append(append(el("thead"), head));
	const body = el("tbody");
	for (const row of rows) {
		const line = el("tr");
		for (const cell of row) {
			const td = el("td");
			if (typeof cell === "string") td.textContent = cell;
			else td.append(cell);
			line.append(td);
		}
		body.append(line);
	}
	node.append(body);
	wrap.append(node);
	if (!rows.length) wrap.append(el("p", tr("none"), "muted"));
	return wrap;
}
function meter(used: number, limit: number) {
	const node = el("div", "", "meter");
	const bar = el("i");
	bar.style.width = `${Math.min(100, (100 * used) / Math.max(1, limit))}%`;
	node.append(bar);
	return node;
}
function icon(path: string) {
	const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
	svg.setAttribute("viewBox", "0 0 16 16");
	svg.setAttribute("fill", "none");
	svg.setAttribute("stroke", "currentColor");
	svg.setAttribute("aria-hidden", "true");
	const shape = document.createElementNS("http://www.w3.org/2000/svg", "path");
	shape.setAttribute("d", path);
	svg.append(shape);
	return svg;
}
const address = (record: { scope: string; pos: number }) =>
	`${record.scope}#${record.pos}`;
const rangeAddress = (key: string, range: Range) =>
	`${key}#${range.start}-${range.start + 2 ** range.level - 1}`;
const lineAddress = (key: string, line: SliceLine) =>
	line.kind === "record" ? `${key}#${line.pos}` : rangeAddress(key, line.range);
/** The date span of one period, with the shared year and month once. */
function span(from: string, to: string): string {
	const first = from.slice(0, 10);
	const last = to.slice(0, 10);
	if (!first || !last) return `${first}..${last}`;
	if (first === last) return first;
	const [yearA, monthA] = first.split("-");
	const [yearB, monthB, dayB] = last.split("-");
	if (yearA === yearB && monthA === monthB) return `${first}..${dayB}`;
	if (yearA === yearB) return `${first}..${monthB}-${dayB}`;
	return `${first}..${last}`;
}
const kindName = (kind: NoteKind | "unavailable") =>
	kind === "unavailable" ? tr("none") : tr(KIND_KEYS[kind] as keyof Table);
let messageTimer: ReturnType<typeof setTimeout> | undefined;
function message(text: string, error = false) {
	clearTimeout(messageTimer);
	const note = document.querySelector<HTMLElement>("dialog[open] .dlg-note");
	if (note) status.textContent = "";
	const target = note ?? status;
	target.textContent = text;
	target.classList.toggle("error", error);
	if (text)
		messageTimer = setTimeout(
			() => {
				target.textContent = "";
			},
			error ? 8000 : 2500,
		);
}
function language(code: string): Lang {
	const short = code.slice(0, 2) as Lang;
	return LANGS.includes(short) ? short : "en";
}
function theme(code: string): Choice {
	return code === "light" || code === "dark" ? code : "system";
}
function remember(key: string, value: string) {
	try {
		localStorage.setItem(key, value);
	} catch {
		// A blocked storage keeps the choice for this page only.
	}
}
// #endregion BLOCK_helpers

// #region FUNC_applyTheme
/**
 * @purpose Put the chosen theme on the page and follow the system setting.
 * @invariants The attribute holds the resolved theme, so the stylesheet needs two palettes only.
 * A system change repaints the page without a reload.
 */
function applyTheme(): void {
	const dark =
		state.theme === "dark" ||
		(state.theme === "system" &&
			window.matchMedia("(prefers-color-scheme: dark)").matches);
	document.documentElement.dataset.theme = dark ? "dark" : "light";
	console.debug("Console theme", { event: "theme", choice: state.theme, dark });
}
// #endregion FUNC_applyTheme

// #region FUNC_request
/** @purpose Surface API errors and return successful JSON results. */
async function request<T>(path: string, body?: unknown): Promise<T> {
	const response = await fetch(
		path,
		body === undefined
			? { cache: "no-store" }
			: {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(body),
				},
	);
	const text = await response.text();
	let value: unknown;
	try {
		value = text ? JSON.parse(text) : null;
	} catch {
		throw new Error(tr("badJson", { status: response.status }));
	}
	if (!response.ok)
		throw new Error(
			value && typeof value === "object" && "error" in value
				? String(value.error)
				: `HTTP ${response.status}`,
		);
	return value as T;
}
// #endregion FUNC_request

// #region FUNC_action
/** @purpose Apply one user action once and refresh its visible result. */
async function action(name: string, extra: Record<string, unknown> = {}) {
	if (state.busy) throw new Error(tr("busyAction"));
	state.busy = true;
	message(tr("saving"));
	try {
		console.debug("Console action", {
			event: "action",
			action: name,
			profile: state.profile,
			scope: state.scope,
		});
		const result = await request<unknown>("/api/action", {
			profile: state.profile,
			scope: state.scope,
			action: name,
			...extra,
		});
		for (const dialog of document.querySelectorAll("dialog[open]"))
			(dialog as HTMLDialogElement).close();
		state.selection = undefined;
		await reload();
		message(tr("saved"));
		return result;
	} finally {
		state.busy = false;
	}
}
// #endregion FUNC_action

// #region FUNC_reload
/** @purpose Refresh the console after a profile, scope, or store change. */
async function reload(): Promise<void> {
	const token = ++state.generation;
	message(tr("loading"));
	const params = new URLSearchParams({
		profile: state.profile,
		scope: state.scope,
	});
	const view = await request<View>(`/api/view?${params.toString()}`);
	if (token !== state.generation) return;
	if (!view || !Array.isArray(view.scopes) || !Array.isArray(view.records))
		throw new Error(tr("badView"));
	state.model = view;
	state.profile = view.profile;
	state.scope = view.scope;
	console.debug("Console loaded", {
		event: "view",
		profile: state.profile,
		scope: state.scope,
		records: view.records.length,
		frontier: view.frontier.length,
		revision: view.revision,
	});
	message("");
	render();
}
// #endregion FUNC_reload

// #region FUNC_run
/** @purpose Keep one failed action from blocking the next one. */
async function run(fn: () => unknown): Promise<void> {
	try {
		await fn();
	} catch (error) {
		console.debug("Console action failed", {
			event: "error",
			message: String(error),
		});
		message(error instanceof Error ? error.message : String(error), true);
	}
}
// #endregion FUNC_run

// #region FUNC_render
/**
 * @purpose Keep the chrome and the current screen consistent with the latest model.
 * @invariants The header holds the profile, the language, the theme, the here budget, and the create
 * action. The rail holds the seven screens and the scopes. The footer holds only the store, the
 * revision, and the backend.
 */
function render(): void {
	if (!state.model) return;
	const model = state.model;
	table = messages(state.lang);
	document.documentElement.lang = state.lang;
	document.title = tr("title");
	const skip = document.querySelector<HTMLAnchorElement>(".skip");
	if (skip) skip.textContent = tr("skip");
	shell.replaceChildren();
	shell.append(header(model), layout(model), footer(model));
}
// #endregion FUNC_render

function header(model: View) {
	const node = el("header");
	const brand = el("div", "", "brand");
	brand.append(el("b", "memlens"));
	const profiles = select(model.profiles, state.profile);
	profiles.id = "profile";
	profiles.onchange = () =>
		run(async () => {
			state.profile = profiles.value;
			await reset("");
		});
	const langs = select([...LANGS], state.lang, "");
	for (const option of langs.options)
		option.textContent = LANG_NAMES[option.value as Lang] ?? option.value;
	langs.id = "lang";
	langs.onchange = () => {
		state.lang = language(langs.value);
		remember("memlens.lang", state.lang);
		render();
	};
	const themes = select(["system", "light", "dark"], state.theme, "");
	themes.id = "theme";
	for (const option of themes.options)
		option.textContent = tr(
			`theme${option.value[0]?.toUpperCase()}${option.value.slice(1)}` as keyof Table,
		);
	themes.onchange = () => {
		state.theme = theme(themes.value);
		remember("memlens.theme", state.theme);
		applyTheme();
	};
	const budget = el("div", "", "budget");
	budget.append(
		el(
			"span",
			tr("lines", {
				used: model.budgets.here.used,
				limit: model.budgets.here.limit,
			}),
		),
		meter(model.budgets.here.used, model.budgets.here.limit),
	);
	node.append(
		brand,
		pill(tr("profile"), profiles),
		pill(tr("language"), langs),
		pill(tr("theme"), themes),
	);
	if (model.candidates.length)
		node.append(pill(tr("dirty"), String(model.candidates.length), true));
	node.append(
		el("span", "", "hspacer"),
		budget,
		btn(tr("newRecord"), noteDialog, "pri"),
	);
	return node;
}

function layout(model: View) {
	const rail = el("aside");
	const nav = el("nav");
	nav.setAttribute("aria-label", tr("screens"));
	const titles = [
		tr("nav0"),
		tr("nav1"),
		tr("nav2"),
		tr("nav3"),
		tr("nav4"),
		tr("nav5"),
		tr("nav6"),
	];
	for (let index = 0; index < titles.length; index++) {
		const item = btn(
			"",
			() => {
				state.screen = index;
				render();
			},
			state.screen === index ? "nav on" : "nav",
		);
		if (state.screen === index) item.setAttribute("aria-current", "page");
		item.append(icon(ICONS[index] ?? ""), el("span", titles[index] ?? ""));
		nav.append(item);
	}
	const scopes = el("div", "", "scopes");
	scopes.setAttribute("aria-label", tr("scopes"));
	for (const item of model.scopes)
		scopes.append(
			btn(
				item.key,
				() => reset(item.key),
				item.key === state.scope ? "sc on" : "sc",
			),
		);
	rail.append(
		el("div", tr("screens"), "rail-title"),
		nav,
		el("div", tr("scopes"), "rail-title"),
		scopes,
	);
	const main = el("main");
	main.id = "main";
	main.tabIndex = -1;
	main.append(el("h1", titles[state.screen] ?? ""));
	const screens = [
		overview,
		tree,
		catalog,
		search,
		review,
		proposals,
		maintenance,
	];
	screens[state.screen]?.(main, model);
	const body = el("div", "", "layout");
	body.append(rail, main);
	return body;
}

function footer(model: View) {
	const node = el("footer");
	node.append(
		el("span", `${tr("store")}: ${model.path}`),
		el("span", `${tr("revision")}: ${model.revision.slice(0, 12)}`),
		el("span", `${tr("backend")}: ${model.backend}`),
	);
	return node;
}

async function reset(nextScope: string) {
	state.scope = nextScope;
	state.selection = undefined;
	state.hits = [];
	state.job = undefined;
	state.jobError = "";
	await reload();
}

// #region FUNC_overview
/**
 * @purpose Show each visible scope as one card and the assembled slice below.
 * @invariants Keep a card for a scope with no live note. Quote the whole slice as text: the page
 * scrolls, and the slice holds no height limit and no inner scroll.
 */
function overview(main: HTMLElement, model: View): void {
	main.append(el("p", tr("ovText"), "sub"));
	const cards = el("div", "", "cards");
	for (const item of model.scopes) {
		const card = el(
			"section",
			"",
			item.key === state.scope ? "card active" : "card",
		);
		const head = el("div", "", "card-head");
		head.append(el("span", item.key, "key"));
		if (item.key === state.scope) head.append(el("span", tr("live"), "tag"));
		const stats = el("div", "", "stats");
		for (const [name, value] of [
			[tr("live"), item.live],
			[tr("hidden"), item.hidden],
			[tr("deleted"), item.deleted],
		] as const)
			stats.append(el("span", `${value} ${name}`, ""));
		const lines = item.frontier.split("\n").filter(Boolean);
		const mini = el("div", "", "mini");
		for (const text of lines.slice(0, 3)) mini.append(el("div", text, ""));
		if (!lines.length) mini.append(el("div", tr("noFrontier"), "muted"));
		card.append(
			head,
			stats,
			mini,
			btn(tr("openScope"), () => reset(item.key)),
		);
		cards.append(card);
	}
	main.append(cards);
	const slice = panel(
		tr("slice"),
		tr("lines", {
			used: model.budgets.here.used,
			limit: model.budgets.here.limit,
		}),
	);
	const text = el("pre", model.text, "slice");
	slice.append(text);
	main.append(slice);
}
// #endregion FUNC_overview

// #region FUNC_tree
/**
 * @purpose Show the frontier of the selected scope beside the inspector.
 * @invariants Draw every line from the model frontier. A range line opens its children, and a note
 * line opens its record. A temporary line shows its period only.
 */
function tree(main: HTMLElement, model: View): void {
	const heading = main.querySelector("h1");
	if (heading) heading.textContent = `${tr("nav1")} · ${state.scope}`;
	main.append(el("p", tr("treeText"), "sub"));
	const lines = model.frontier;
	const live = model.records.filter(
		(record) => record.scope === state.scope && record.state === "live",
	);
	const panelNode = panel(
		tr("frontier"),
		tr("frontierMeta", { ranges: lines.length, live: live.length }),
	);
	const strip = el("div", "", "coverage");
	const legend = el("div", "", "legend");
	for (const kind of ["record", "summary", "temporary"] as const) {
		const name =
			kind === "record"
				? tr("record")
				: kind === "summary"
					? tr("clean")
					: tr("pending");
		strip.append(el("i", "", kind[0] ?? ""));
		legend.append(el("span", name, `lg ${kind[0] ?? ""}`));
	}
	panelNode.append(strip, legend);
	const list = el("div", "", "lines");
	for (const line of lines) list.append(frontierLine(state.scope, line));
	if (!lines.length) list.append(el("p", tr("noFrontier"), "muted"));
	panelNode.append(list);
	const children =
		state.selection?.result.kind === "children"
			? childrenPanel(state.selection.target, state.selection.result)
			: undefined;
	const column = el("div", "", "column");
	if (children) column.append(children);
	const split = el("div", "", "split");
	split.append(panelNode, inspector());
	main.append(split, column);
}
// #endregion FUNC_tree

function frontierLine(key: string, line: SliceLine) {
	const target = lineAddress(key, line);
	const text =
		line.kind === "record"
			? line.body
			: line.kind === "summary"
				? line.summary
				: line.text;
	const node = btn("", () => openTarget(target), `line ${line.kind[0] ?? ""}`);
	node.append(el("span", target, "id"));
	node.append(el("span", text || span(line.from, line.to), "tx"));
	if (line.kind === "temporary") node.classList.add("pending");
	if (state.selection?.target === target) node.classList.add("sel");
	node.title = text || tr("notBuilt");
	return node;
}

function childrenPanel(target: string, result: OpenChildren) {
	const node = panel(
		`${tr("children")} · ${target}`,
		String(result.children.length),
	);
	const list = el("div", "", "lines");
	for (const child of result.children) list.append(childLine(child));
	node.append(list);
	return node;
}

function childLine(child: OpenLine) {
	const node = btn("", () => openTarget(child.addr), "line");
	node.append(el("span", child.addr, "id"));
	node.append(
		el(
			"span",
			child.built ? child.text : span(child.ts_from, child.ts_to),
			"tx",
		),
	);
	if (!child.built) node.classList.add("pending");
	node.title = child.built ? child.text : tr("notBuilt");
	return node;
}

// #region FUNC_inspector
/**
 * @purpose Show the selected note or range with its provenance and its record actions.
 * @invariants Put the body and the document into text nodes. Disable delete without host permission.
 */
function inspector(): HTMLElement {
	const node = panel(
		state.selection
			? `${tr("inspector")} · ${state.selection.target}`
			: tr("inspector"),
	);
	node.classList.add("ins");
	if (!state.selection) {
		node.append(el("p", tr("selectLine"), "muted"));
		return node;
	}
	const { result } = state.selection;
	if (result.kind === "children") {
		node.append(el("p", tr("noSummary"), "muted"));
		return node;
	}
	const record = state.model?.records.find((item) => item.id === result.id);
	const quote = el("div", "", "quote");
	quote.append(document.createTextNode(result.body));
	if (result.longform) quote.append(el("div", result.longform, "doc"));
	node.append(quote);
	node.append(
		kv([
			[tr("id"), result.id],
			[tr("time"), result.ts],
			[tr("kind"), kindName(record?.kind ?? "unavailable")],
			[tr("session"), record?.session ?? tr("none")],
			[tr("preset"), record?.preset ?? tr("none")],
			[tr("refs"), result.refs.join(", ") || tr("none")],
			[tr("supersedes"), record?.supersedes.join(", ") || tr("none")],
			[tr("supersededBy"), record?.superseded_by ?? tr("none")],
			[tr("reviewAt"), result.review_at ?? tr("none")],
			[tr("modifiedAt"), result.modified_at ?? tr("none")],
		]),
	);
	node.append(recordActions(result.addr, record));
	const extra = el("div", "", "actions");
	extra.append(
		btn(tr("copyId"), async () => {
			await navigator.clipboard.writeText(result.id);
			message(tr("copied"));
		}),
	);
	if (state.screen !== 1)
		extra.append(btn(tr("openInTree"), () => openInTree(result.addr)));
	node.append(extra);
	return node;
}
// #endregion FUNC_inspector

function recordActions(target: string, record?: ProjectionRecord) {
	const row = el("div", "", "actions");
	row.append(
		btn(tr("actReviewed"), () => action("review", { target })),
		btn(tr("actAmend"), () => editTarget(target, false)),
		btn(tr("actSupersede"), () => editTarget(target, true)),
		btn(tr("actForget"), async () => {
			if (confirm(tr("confirmForget", { target })))
				await action("forget", { target });
		}),
	);
	const remove = btn(
		tr("actDelete"),
		async () => {
			if (confirm(tr("confirmDelete", { target })))
				await action("delete", { target, confirm: true });
		},
		"danger",
	);
	remove.disabled = !state.model?.allowDelete || record?.state === "deleted";
	row.append(remove);
	return row;
}

async function editTarget(target: string, supersede: boolean) {
	const record = state.model?.records.find((item) => address(item) === target);
	if (record) {
		noteDialog(record, supersede ? target : "");
		return;
	}
	const result = await request<OpenEntry | OpenChildren>(
		`/api/open?${new URLSearchParams({ profile: state.profile, scope: state.scope, target })}`,
	);
	if (result.kind !== "entry") throw new Error(tr("selectLine"));
	noteDialog(result, supersede ? target : "");
}

// #region FUNC_openTarget
/** @purpose Expand a range or inspect a note, and keep the selection for the inspector. */
async function openTarget(target: string): Promise<void> {
	const token = state.generation;
	const result = await request<OpenEntry | OpenChildren>(
		`/api/open?${new URLSearchParams({ profile: state.profile, scope: state.scope, target })}`,
	);
	if (token !== state.generation) return;
	console.debug("Console target opened", {
		event: "open",
		target,
		kind: result.kind,
	});
	state.selection = { target, result };
	render();
}
// #endregion FUNC_openTarget

// #region FUNC_openInTree
/** @purpose Select the tree screen and open one record in its inspector. */
async function openInTree(target: string): Promise<void> {
	await openTarget(target);
	state.screen = 1;
	render();
}
// #endregion FUNC_openInTree

// #region FUNC_catalog
/**
 * @purpose Show the catalog lines of the visible scopes with the directions budget.
 * @invariants The panel holds the direction lines of the model, so each line names its scope.
 * State no rule that the store does not hold.
 */
function catalog(main: HTMLElement, model: View): void {
	main.append(el("p", tr("catText"), "sub"));
	const lines = panel(
		tr("catLines"),
		tr("lines", {
			used: model.budgets.directions.used,
			limit: model.budgets.directions.limit,
		}),
	);
	const pre = el("pre", model.directions, "slice");
	if (!model.directions) pre.textContent = tr("emptyCatalog");
	lines.append(pre, bar("directions", model.budgets.directions));
	const nodes = model.nodes.filter((item) =>
		item.scope.startsWith("__catalog__:"),
	);
	const detail = panel(tr("catNodes"), String(nodes.length));
	detail.append(
		tableOf(
			[tr("range"), tr("dates"), tr("chars"), tr("state")],
			nodes.map((item) => [
				rangeAddress(item.scope, item.node.range),
				span(item.node.ts_from, item.node.ts_to),
				String(item.node.chars),
				item.clean ? tr("clean") : tr("dirty"),
			]),
		),
	);
	const split = el("div", "", "split");
	split.append(lines, detail);
	main.append(split);
}
// #endregion FUNC_catalog

// #region FUNC_search
/**
 * @purpose Find notes by words in one scope or in every visible scope.
 * @invariants The default scope filter is every visible scope. Show the hit count and keep the
 * selection beside the results.
 */
function search(main: HTMLElement, model: View): void {
	main.append(el("p", tr("searchText"), "sub"));
	const words = input(state.query);
	words.spellcheck = false;
	words.placeholder = tr("searchText");
	const scopes = select(
		["", ...model.scopes.map((item) => item.key)],
		state.searchScope,
		tr("allScopes"),
	);
	const kinds = select(["", ...KINDS], state.kind, tr("allKinds"));
	for (const option of kinds.options)
		option.textContent = option.value
			? tr(KIND_KEYS[option.value as NoteKind] as keyof Table)
			: tr("allKinds");
	const date = input(state.since, "date");
	const cap = input(state.limit, "number");
	cap.min = "1";
	cap.max = "50";
	const find = btn(tr("find"), search, "pri");
	const bar = el("div", "", "searchbar");
	bar.append(words, find);
	words.addEventListener("keydown", (event) => {
		if (event.key === "Enter") run(search);
	});
	async function search() {
		state.query = words.value.trim();
		state.kind = kinds.value;
		state.since = date.value;
		state.limit = cap.value;
		state.searchScope = scopes.value;
		if (!state.query) {
			message(tr("searchHint"));
			return;
		}
		const token = state.generation;
		const params = new URLSearchParams({
			profile: state.profile,
			scope: state.searchScope,
			query: state.query,
			kind: state.kind,
			since: state.since,
			limit: state.limit,
		});
		const found = await request<IndexHit[]>(`/api/search?${params.toString()}`);
		if (token !== state.generation) return;
		state.hits = found;
		console.debug("Console search", { event: "search", hits: found.length });
		render();
	}
	const filters = el("div", "", "filters");
	for (const [name, control] of [
		[tr("scope"), scopes],
		[tr("kindLabel"), kinds],
		[tr("since"), date],
		[tr("limit"), cap],
	] as const) {
		const wrap = el("label", "", "");
		wrap.append(el("span", name), control);
		filters.append(wrap);
	}
	main.append(bar, filters);
	const list = panel(
		tr("matches", { count: state.hits.length }),
		state.searchScope || tr("allScopes"),
	);
	for (const hit of state.hits) {
		const node = btn("", () => openTarget(hit.addr), "hit");
		node.append(
			el("span", hit.addr, "id"),
			el("span", kindName(hit.kind), "kind"),
			highlight(hit.body),
			el("span", hit.ts.slice(0, 10), "when"),
		);
		list.append(node);
	}
	if (!state.hits.length) list.append(el("p", tr("noMatches"), "muted"));
	const split = el("div", "", "split");
	split.append(list, inspector());
	main.append(split);
}
// #endregion FUNC_search

function highlight(body: string) {
	const node = el("span", "", "tx");
	const tokens = state.query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
	const lower = body.toLocaleLowerCase();
	let offset = 0;
	while (offset < body.length) {
		const match = tokens
			.map((word) => ({ at: lower.indexOf(word, offset), word }))
			.filter((item) => item.at >= 0)
			.sort((a, b) => a.at - b.at)[0];
		if (!match) {
			node.append(document.createTextNode(body.slice(offset)));
			break;
		}
		node.append(
			document.createTextNode(body.slice(offset, match.at)),
			el("mark", body.slice(match.at, match.at + match.word.length)),
		);
		offset = match.at + match.word.length;
	}
	return node;
}

// #region FUNC_review
/** @purpose List the due notes and the next notes with their review dates and the record actions. */
function review(main: HTMLElement, model: View): void {
	main.append(el("p", tr("revText"), "sub"));
	const rows = (items: View["review"]) =>
		items.map((item) => [
			btn(item.addr, () => openInTree(item.addr)),
			item.body,
			kindName(item.kind),
			item.review_at?.slice(0, 10) ?? tr("none"),
			recordActions(item.addr),
		]);
	const headers = [
		tr("address"),
		tr("text"),
		tr("kind"),
		tr("reviewDate"),
		tr("actions"),
	];
	const list = panel(tr("due"), `${model.review.length}`);
	list.append(tableOf(headers, rows(model.review)));
	const next = panel(tr("next"), `${model.reviewNext.length}`);
	next.append(tableOf(headers, rows(model.reviewNext)));
	const policy = panel(
		tr("reviewPeriods"),
		String(Object.keys(model.reviewPolicy).length),
	);
	policy.append(
		kv(
			Object.entries(model.reviewPolicy).map(([name, days]) => [
				kindName(name as NoteKind),
				tr("days", { count: days }),
			]),
		),
	);
	main.append(list, next, policy);
}
// #endregion FUNC_review

// #region FUNC_proposals
/** @purpose Show each pending proposal with its session, scope, age, and decision. */
function proposals(main: HTMLElement, model: View): void {
	main.append(el("p", tr("propText"), "sub"));
	const list = panel(tr("waiting"), String(model.proposals.length));
	list.append(
		tableOf(
			[tr("id"), tr("session"), tr("text"), tr("scope"), tr("decision")],
			model.proposals.map((item) => [
				item.id,
				"session" in item ? item.session : tr("none"),
				"body" in item ? (item.body ?? "") : item.op,
				item.scope,
				append(
					el("div", "", "actions"),
					btn(tr("accept"), () => action("accept", { target: item.id }), "pri"),
					btn(tr("dismiss"), () => action("dismiss", { target: item.id })),
				),
			]),
		),
	);
	main.append(list);
}
// #endregion FUNC_proposals

// #region FUNC_maintenance
/**
 * @purpose Show the build state, the budgets, and the compaction job.
 * @invariants Show no compaction state and no session snapshot state. A job without a merge input
 * states that fact and shows no answer form.
 */
function maintenance(main: HTMLElement, model: View): void {
	main.append(el("p", tr("maintText"), "sub"));
	const tiles = el("div", "", "tiles");
	for (const [value, name] of [
		[model.records.length, tr("records")],
		[model.nodes.length, tr("treeNodes")],
		[model.candidates.length, tr("mergeCandidates")],
	] as const) {
		const tile = el("div", "", "tile");
		tile.append(el("div", String(value), "n"), el("div", name, "l"));
		tiles.append(tile);
	}
	const budgets = panel(tr("lineBudgets"));
	budgets.append(
		bar("here", model.budgets.here),
		bar("directions", model.budgets.directions),
	);
	const candidates = panel(
		tr("mergeCandidates"),
		String(model.candidates.length),
	);
	candidates.append(
		tableOf(
			[tr("scope"), tr("range"), tr("level"), tr("state")],
			model.candidates.map((item) => [
				item.scope,
				rangeAddress(item.scope, item.range),
				String(item.range.level),
				item.ready ? tr("ready") : tr("waits"),
			]),
		),
	);
	const levels = [
		...new Set([
			...model.nodes.map((item) => item.node.range.level),
			...model.candidates.map((item) => item.range.level),
		]),
	].sort((a, b) => a - b);
	const perLevel = panel(tr("nodesByLevel"));
	perLevel.append(
		tableOf(
			[tr("level"), tr("nodes"), tr("dirty"), tr("candidates")],
			levels.map((level) => [
				String(level),
				String(
					model.nodes.filter((item) => item.node.range.level === level).length,
				),
				String(
					model.nodes.filter(
						(item) => item.node.range.level === level && !item.clean,
					).length,
				),
				String(
					model.candidates.filter((item) => item.range.level === level).length,
				),
			]),
		),
	);
	main.append(tiles, budgets, candidates, perLevel, compactionPanel(model));
}
// #endregion FUNC_maintenance

function bar(name: string, value: { used: number; limit: number }) {
	const node = el("div", "", "bar");
	const track = el("div", "", "track");
	const fillNode = el("i");
	fillNode.style.width = `${Math.min(100, (100 * value.used) / Math.max(1, value.limit))}%`;
	track.append(fillNode);
	node.append(
		el("span", name),
		track,
		el("span", tr("lines", { used: value.used, limit: value.limit })),
	);
	return node;
}

function compactionPanel(model: View) {
	const node = panel(
		state.job?.catalog
			? `${tr("compaction")} · ${tr("nav2")}`
			: tr("compaction"),
	);
	const buttons = el("div", "", "actions");
	for (const catalog of [false, true])
		buttons.append(
			btn(
				catalog ? tr("prepareCatalog") : tr("prepareScope"),
				async () => {
					const result = (await action("compact", { catalog })) as {
						inputs: BuildInput[];
						job: string;
					};
					if (!result || !Array.isArray(result.inputs))
						throw new Error(tr("badJob"));
					state.job = {
						inputs: result.inputs,
						job: result.job,
						catalog,
						profile: state.profile,
						scope: state.scope,
					};
					state.jobError = "";
					render();
				},
				"pri",
			),
		);
	node.append(buttons);
	const job = state.job;
	if (!job) return node;
	if (!job.inputs.length) {
		node.append(
			el("p", tr(job.catalog ? "noInputsCatalog" : "noInputs"), "muted"),
		);
		return node;
	}
	const tasks = el("pre", job.job, "slice");
	const copy = btn(tr("copy"), async () => {
		await navigator.clipboard.writeText(job.job);
		message(tr("copied"));
	});
	const answers = el("textarea");
	answers.rows = 5;
	answers.spellcheck = false;
	answers.placeholder = tr("answersHint");
	const wanted = job.inputs.map(
		(input) =>
			`#${input.range.start}-${input.range.start + 2 ** input.range.level - 1}`,
	);
	const failure = el("p", state.jobError, "banner");
	if (!state.jobError) failure.hidden = true;
	const apply = btn(
		tr("applyAnswers"),
		async () => {
			try {
				if (!answers.value.trim()) throw new Error(tr("enterAnswers"));
				const unknown = answers.value
					.split("\n")
					.map((line) => /^#(\d+)-(\d+):/.exec(line.trim()))
					.filter((match) => match !== null)
					.map((match) => `#${match[1]}-${match[2]}`)
					.filter((id) => !wanted.includes(id));
				if (unknown.length)
					throw new Error(tr("unknownInput", { inputs: wanted.join(", ") }));
				const result = (await action("compact-answer", {
					catalog: job.catalog,
					inputs: job.inputs,
					answers: answers.value,
				})) as { built: number; rejected: number; rejectedRanges: string[] };
				state.job = result.rejected ? job : undefined;
				state.jobError = result.rejected
					? tr("rejectedRanges", {
							ranges: (result.rejectedRanges ?? []).join(", "),
						})
					: "";
				render();
				message(
					result.rejected
						? state.jobError
						: tr("built", { built: result.built, rejected: result.rejected }),
					result.rejected > 0,
				);
			} catch (error) {
				const text = error instanceof Error ? error.message : String(error);
				state.jobError = text;
				failure.textContent = text;
				failure.hidden = false;
				message(text, true);
			}
		},
		"pri",
	);
	apply.disabled = job.profile !== state.profile || job.scope !== state.scope;
	node.append(
		el("div", "", "actions"),
		el("span", tr("mergeTasks"), "lbl"),
		copy,
		tasks,
		field(`${tr("answers")} · ${wanted.join(", ")}`, answers),
		apply,
		failure,
	);
	return node;
}

// #region FUNC_noteDialog
/**
 * @purpose Create, amend, or supersede a record with explicit user input.
 * @invariants Show the body, the document, the scope, the kind, and the addresses that the note
 * replaces. An amendment changes each of these fields. An amendment with another scope moves the
 * record to that scope with a new position.
 */
function noteDialog(
	record?: ProjectionRecord | OpenEntry,
	supersedes = "",
	fresh = false,
): void {
	const dialog = el("dialog");
	const form = el("form");
	const amend = record !== undefined && !supersedes;
	const head = el("div", "", "head");
	head.append(el("span", amend ? tr("amendTitle") : tr("newTitle"), "t"));
	dialog.append(head);
	const note = el("textarea");
	note.value = record?.body ?? "";
	note.required = true;
	note.rows = 3;
	note.spellcheck = false;
	const counter = el("div", "", "counter");
	const update = () => {
		counter.textContent = tr("characters", { count: note.value.length });
	};
	note.oninput = update;
	update();
	const longform = el("textarea");
	longform.value = record?.longform ?? "";
	longform.rows = 5;
	longform.spellcheck = false;
	const scopeInput = input(fresh ? "" : (record?.scope ?? state.scope));
	scopeInput.required = true;
	scopeInput.pattern = "[^:]+:[^:]+";
	scopeInput.placeholder = "project:example";
	const kindInput = select(
		[...KINDS],
		record && "kind" in record ? record.kind : "note",
	);
	for (const option of kindInput.options)
		option.textContent = tr(KIND_KEYS[option.value as NoteKind] as keyof Table);
	const replace = input(supersedes);
	replace.spellcheck = false;
	const scopeField = field(tr("scopeField"), scopeInput);
	if (!amend) scopeField.append(el("div", tr("newScopeHint"), "hint"));
	const replaceField = field(tr("supersedesField"), replace);
	const row = el("div", "", "row2");
	row.append(scopeField, field(tr("kindField"), kindInput));
	form.append(
		field(tr("body"), note),
		counter,
		field(tr("longform"), longform),
		row,
	);
	form.append(replaceField, el("div", "", "dlg-note"));
	const save = btn(amend ? tr("save") : tr("create"), () => {}, "pri");
	save.type = "submit";
	const foot = el("div", "", "dlg-foot");
	foot.append(
		btn(tr("cancel"), () => dialog.close(), "ghost"),
		save,
	);
	form.append(foot);
	form.onsubmit = (event) => {
		event.preventDefault();
		run(async () => {
			save.disabled = true;
			try {
				await action(amend ? "amend" : "note", {
					body: note.value,
					longform: longform.value,
					kind: kindInput.value as NoteKind,
					supersedes: replace.value,
					...(amend
						? {
								target: `${record.scope}#${record.pos}`,
								dest: scopeInput.value,
							}
						: { scope: scopeInput.value }),
				});
				dialog.close();
			} finally {
				save.disabled = false;
			}
		});
	};
	dialog.append(form);
	dialog.addEventListener("close", () => dialog.remove());
	document.body.append(dialog);
	dialog.showModal();
	note.focus();
}
// #endregion FUNC_noteDialog

document.addEventListener("keydown", (event) => {
	if (
		event.key >= "1" &&
		event.key <= "7" &&
		!document.querySelector("dialog[open]") &&
		!["INPUT", "TEXTAREA", "SELECT"].includes(
			(document.activeElement as HTMLElement | null)?.tagName ?? "",
		)
	) {
		state.screen = Number(event.key) - 1;
		render();
	}
});
window
	.matchMedia("(prefers-color-scheme: dark)")
	.addEventListener("change", () => {
		if (state.theme === "system") applyTheme();
	});

applyTheme();
run(reload);

/**
 * #region moduleContract
 * @purpose Let a human inspect and maintain memory through seven dense console screens.
 * @scope Native DOM controls and the standalone HTTP API only.
 * @invariants Render store text as text. Keep destructive actions explicit. Never claim unavailable session state.
 * @dependencies GET view, search, open and POST action from the CLI host.
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
import type { BuildInput, Range } from "../../core/src/types/tree.js";

type View = ConsoleModel & {
	profiles: string[];
	path: string;
	backend: string;
	allowDelete: boolean;
	reviewPolicy: Record<NoteKind, number>;
	proposals: MemoryEvent[];
};
const labels = {
	en: "Directions|Tree|Catalog map|Search|Review|Proposals|Maintenance|New record|Add|Forget|Delete|Profile".split(
		"|",
	),
	de: "Übersicht|Baum|Katalog|Suche|Prüfung|Vorschläge|Wartung|Neuer Eintrag|Hinzufügen|Ausblenden|Löschen|Profil".split(
		"|",
	),
	es: "Direcciones|Árbol|Catálogo|Buscar|Revisión|Propuestas|Mantenimiento|Nueva nota|Añadir|Ocultar|Eliminar|Perfil".split(
		"|",
	),
	fr: "Directions|Arbre|Catalogue|Recherche|Révision|Propositions|Maintenance|Nouvelle note|Ajouter|Masquer|Supprimer|Profil".split(
		"|",
	),
	ja: "概要|ツリー|カタログ|検索|レビュー|提案|保守|新規ノート|追加|非表示|削除|プロファイル".split(
		"|",
	),
	pt: "Direções|Árvore|Catálogo|Pesquisa|Revisão|Propostas|Manutenção|Nova nota|Adicionar|Ocultar|Excluir|Perfil".split(
		"|",
	),
	ru: "Обзор|Дерево|Каталог|Поиск|Проверка|Предложения|Обслуживание|Новая запись|Добавить|Скрыть|Удалить|Профиль".split(
		"|",
	),
	zh: "概览|树|目录|搜索|复核|提案|维护|新建记录|添加|隐藏|删除|配置".split(
		"|",
	),
};
const icons = [
	"M2 3h12M2 8h12M2 13h7",
	"M8 14V9M8 9L4 6M8 9l4-3M4 6V3M12 6V3",
	"M2 12l3-5 3 2 3-6 3 3",
	"M10.2 10.2L14 14M6 3a4.2 4.2 0 100 8.4A4.2 4.2 0 006 3z",
	"M3 8l3 3 7-7",
	"M3 4h10M3 8h10M3 12h6",
	"M2 8h3l2-4 2 8 2-4h3",
];
type Locale = keyof typeof labels;
let locale: Locale = (
	navigator.language.slice(0, 2) in labels
		? navigator.language.slice(0, 2)
		: "en"
) as Locale;
let model: View | undefined;
let profile = "",
	scope = "",
	screen = 0,
	generation = 0,
	busy = false;
let hits: readonly IndexHit[] = [],
	query = "",
	kind = "",
	since = "",
	limit = "10";
let selected: { target: string; result: OpenEntry | OpenChildren } | undefined;
let compact:
	| {
			job: string;
			inputs: BuildInput[];
			profile: string;
			scope: string;
			catalog: boolean;
	  }
	| undefined;
const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Console root is absent");
const status = element("div");
status.id = "status";
status.setAttribute("role", "status");
status.setAttribute("aria-live", "polite");
const shell = element("div", "", "shell");
app.append(status, shell);
const t = (index: number) => labels[locale][index] ?? labels.en[index] ?? "";
const address = (record: { scope: string; pos: number }) =>
	`${record.scope}#${record.pos}`;
const rangeAddress = (key: string, range: Range) =>
	`${key}#${range.start}-${range.start + 2 ** range.level - 1}`;
const age = (iso: string) =>
	`${Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86400000))} d`;
const HUES = ["#46c98b", "#5b9dff", "#8b96a8", "#a78bfa", "#e0a54a", "#e0605e"];
const hue = (key: string) => {
	let hash = 0;
	for (const item of key) hash = (hash * 31 + item.charCodeAt(0)) | 0;
	return HUES[Math.abs(hash) % HUES.length] ?? "#8b96a8";
};

function element<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	text = "",
	className = "",
): HTMLElementTagNameMap[K] {
	const node = document.createElement(tag);
	node.textContent = text;
	node.className = className;
	return node;
}
function append(parent: HTMLElement, ...children: HTMLElement[]) {
	parent.append(...children);
	return parent;
}
function button(
	text: string,
	fn: () => unknown,
	className = "",
): HTMLButtonElement {
	const node = element("button", text, `btn ${className}`.trim());
	node.type = "button";
	node.addEventListener("click", () => run(fn));
	return node;
}
function input(value = "", type = "text") {
	const node = element("input");
	node.type = type;
	node.value = value;
	return node;
}
function select(values: readonly string[], value: string) {
	const node = element("select");
	for (const item of values) {
		const option = element("option", item || "All");
		option.value = item;
		node.append(option);
	}
	node.value = value;
	return node;
}
function field(text: string, control: HTMLElement) {
	const wrap = element("div", "", "field");
	wrap.append(element("label", text), control);
	return wrap;
}
function pill(label: string, value: HTMLElement | string, warn = false) {
	const node = element("span", "", warn ? "pill warn" : "pill");
	node.append(element("span", label));
	node.append(typeof value === "string" ? element("b", value) : value);
	return node;
}
function panel(title: string, right = "") {
	const node = element("section", "", "panel");
	const head = element("div", "", "head");
	head.append(element("span", title, "t"));
	if (right) head.append(element("span", right, "r"));
	node.append(head);
	return node;
}
function kv(rows: [string, string][]) {
	const node = element("div", "", "kv");
	for (const [key, value] of rows) {
		node.append(element("b", key), element("span", value));
	}
	return node;
}
function tile(value: string, label: string, warn = false) {
	const node = element("div", "", warn ? "tile warn" : "tile");
	node.append(element("div", value, "n"), element("div", label, "l"));
	return node;
}
function bar(name: string, value: { used: number; limit: number }) {
	const fill = element("i");
	fill.style.width = `${Math.min(100, (100 * value.used) / Math.max(1, value.limit))}%`;
	const node = element("div", "", "bar");
	node.append(
		element("span", name),
		append(element("div", "", "track"), fill),
		element("span", `${value.used} / ${value.limit}`),
	);
	return node;
}
function message(text: string, error = false) {
	status.textContent = text;
	status.className = error ? "error" : "";
}
async function run(fn: () => unknown) {
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
function params(extra: Record<string, string> = {}) {
	return new URLSearchParams({ profile, scope, ...extra }).toString();
}
function table(headers: string[], rows: (string | HTMLElement)[][]) {
	const wrap = element("div", "", "table-wrap"),
		node = element("table");
	const head = element("tr");
	for (const name of headers) head.append(element("th", name));
	node.append(append(element("thead"), head));
	const body = element("tbody");
	for (const row of rows) {
		const tr = element("tr");
		for (const cell of row) {
			const td = element("td");
			if (typeof cell === "string") td.textContent = cell;
			else td.append(cell);
			tr.append(td);
		}
		body.append(tr);
	}
	node.append(body);
	wrap.append(node);
	if (!rows.length) wrap.append(element("p", "No entries.", "muted body"));
	return wrap;
}

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
		throw new Error(`HTTP ${response.status}: Invalid JSON response`);
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
async function action(
	actionName: string,
	extra: Record<string, unknown> = {},
): Promise<unknown> {
	if (busy) throw new Error("Another action is in progress.");
	busy = true;
	message("Saving…");
	const context = { profile, scope };
	try {
		console.debug("Console action", {
			event: "action",
			action: actionName,
			...context,
		});
		const result = await request<unknown>("/api/action", {
			...context,
			action: actionName,
			...extra,
		});
		for (const dialog of document.querySelectorAll("dialog[open]"))
			(dialog as HTMLDialogElement).close();
		selected = undefined;
		await reload();
		message("Saved.");
		return result;
	} finally {
		busy = false;
	}
}
// #endregion FUNC_action

// #region FUNC_reload
/** @purpose Refresh the console after a profile, scope, or store change. */
async function reload(): Promise<void> {
	const token = ++generation;
	message("Loading…");
	const value = await request<View>(`/api/view?${params()}`);
	if (token !== generation) return;
	if (!value || !Array.isArray(value.scopes) || !Array.isArray(value.records))
		throw new Error("Invalid console response.");
	model = value;
	profile = value.profile;
	scope = value.scope;
	console.debug("Console loaded", {
		event: "view",
		profile,
		scope,
		records: value.records.length,
		revision: value.revision,
	});
	message("");
	render();
}
// #endregion FUNC_reload

// #region FUNC_render
/**
 * @purpose Keep the chrome and the current screen consistent with the latest model.
 * @invariants Show the profile, backend, dirty ranges, and both budgets in the header.
 * Show seven numbered screens, scopes, and scope actions in the rail. Disable delete without host permission.
 * Show the store path, revision, and unavailable session and writer state in the footer.
 */
function render(): void {
	if (!model) return;
	document.documentElement.lang = locale;
	shell.replaceChildren();
	const header = append(element("header"), element("div", "", "brand"));
	header.firstElementChild?.append(element("b", "memlens"));
	const profiles = select(model.profiles, profile);
	profiles.onchange = () =>
		run(async () => {
			profile = profiles.value;
			await reset("");
		});
	const languages = select(Object.keys(labels), locale);
	languages.setAttribute("aria-label", "Language");
	languages.onchange = () => {
		locale = languages.value as Locale;
		render();
	};
	const profilePill = pill(t(11), profiles);
	header.append(
		profilePill,
		pill("backend", model.backend),
		pill("lang", languages),
	);
	if (model.candidates.length)
		header.append(pill("dirty", String(model.candidates.length), true));
	const meter = element("div", "", "meter");
	const hereFill = element("i");
	hereFill.style.background = "#5b9dff";
	hereFill.style.width = `${Math.min(100, (100 * model.budgets.here.used) / Math.max(1, model.budgets.here.limit))}%`;
	meter.append(hereFill);
	const meterLabel = append(
		element("div", "", "meter-lbl"),
		element(
			"span",
			`here ${model.budgets.here.used} / ${model.budgets.here.limit} lines`,
		),
		meter,
	);
	header.append(element("span", "", "hspacer"), meterLabel);
	const create = button(t(7), () => noteDialog(), "pri");
	header.append(create);
	const layout = element("div", "", "layout"),
		rail = element("aside");
	const nav = element("nav");
	nav.setAttribute("aria-label", "Screens");
	rail.append(element("div", "View", "rail-title"));
	for (let index = 0; index < 7; index++) rail.append(navItem(index));
	rail.append(element("div", "", "rail-sep"));
	const scopeList = append(
		element("div"),
		element("div", "Scopes", "rail-title"),
	);
	const scopes = element("div", "", "scopes");
	scopes.setAttribute("aria-label", "Scopes");
	for (const item of model.scopes) {
		const dot = element("i");
		dot.style.background = hue(item.key);
		const node = append(
			button(
				"",
				async () => {
					await reset(item.key);
				},
				item.key === scope ? "sc on" : "sc",
			),
			dot,
		);
		node.append(document.createTextNode(item.key));
		node.title = item.key;
		scopes.append(node);
	}
	scopeList.append(scopes);
	rail.append(
		scopeList,
		element("div", "", "rail-sep"),
		element("div", "Actions", "rail-title"),
		railAction("M8 3v10M3 8h10", t(8), () => noteDialog(undefined, "", true)),
		railAction("M3 8h10", t(9), () => scopeAction(false)),
		railAction("M4 4l8 8M12 4l-8 8", t(10), () => scopeAction(true), true),
	);
	const main = element("main");
	main.id = "main";
	main.tabIndex = -1;
	main.append(element("h1", t(screen)));
	const screens = [
		renderDirections,
		renderTree,
		renderMap,
		renderSearch,
		renderReview,
		renderProposals,
		renderMaintenance,
	];
	screens[screen]?.(main);
	layout.append(rail, main);
	shell.append(
		header,
		layout,
		append(
			element("footer"),
			element("span", model.path),
			element("span", `rev ${model.revision.slice(0, 12)}`),
			element("span", "session snapshot: unavailable"),
			element("span", "writer: unavailable", "fill"),
		),
	);
}
// #endregion FUNC_render

function navItem(index: number) {
	const node = button(
		"",
		() => {
			screen = index;
			render();
		},
		screen === index ? "nav on" : "nav",
	);
	if (screen === index) node.setAttribute("aria-current", "page");
	node.append(icon(icons[index] ?? ""), element("span", t(index)));
	node.append(element("span", String(index + 1), "kbd"));
	return node;
}
function railAction(
	path: string,
	text: string,
	fn: () => unknown,
	danger = false,
) {
	const node = button("", fn, `nav${danger ? " danger" : ""}`);
	node.append(icon(path), element("span", text));
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
async function reset(nextScope: string) {
	scope = nextScope;
	selected = undefined;
	hits = [];
	await reload();
}

// #region FUNC_renderDirections
/**
 * @purpose Show each visible scope as a card and the assembled slice text below.
 * @invariants Keep empty scope cards with their four counts. Mark the selected scope. Quote the slice as text.
 */
function renderDirections(main: HTMLElement): void {
	if (!model) return;
	main.append(
		element(
			"p",
			"Session snapshot, materialization time, and the next trigger are unavailable in the standalone console.",
			"sub",
		),
	);
	const cards = element("div", "", "grid cards");
	for (const item of model.scopes) {
		const card = element(
			"section",
			"",
			item.key === scope ? "card active" : "card",
		);
		if (item.key === scope) card.append(element("span", "active", "tag"));
		card.append(element("div", item.key, "key"));
		const mini = element("div", "", "mini");
		const lines = item.frontier.split("\n").filter(Boolean);
		if (lines.length)
			for (const line of lines.slice(0, 3)) {
				const row = element("div");
				const at = line.indexOf(" ");
				row.append(
					element("b", at > 0 ? line.slice(0, at) : line),
					document.createTextNode(at > 0 ? line.slice(at) : ""),
				);
				mini.append(row);
			}
		else mini.append(element("div", "no frontier text"));
		const stats = element("div", "", "stats");
		for (const [name, value] of [
			["total", item.total],
			["live", item.live],
			["hidden", item.hidden],
			["deleted", item.deleted],
		] as const)
			stats.append(element("span", `${value} ${name}`));
		card.append(
			mini,
			stats,
			button("Open scope", async () => {
				await reset(item.key);
			}),
		);
		cards.append(card);
	}
	main.append(cards);
	const slice = panel(
		"<memory> · assembled slice",
		`${model.budgets.here.used} lines here`,
	);
	const body = element("div", "", "body");
	const text = element("pre", model.text, "slice");
	body.append(text);
	slice.append(body);
	main.append(slice);
}
// #endregion FUNC_renderDirections

// #region FUNC_renderTree
/**
 * @purpose Show the frontier lines beside one inspector panel.
 * @invariants Coverage marks clean, dirty, and outside ranges. A range line opens its two children.
 * A record line opens the note inspector. The selected line stays marked.
 */
function renderTree(main: HTMLElement): void {
	if (!model) return;
	const heading = main.querySelector("h1");
	if (heading) heading.textContent = `${t(1)} · ${scope}`;
	main.append(
		element(
			"p",
			"Click a range line to open its two children. Click a record line to inspect the note.",
			"sub",
		),
	);
	const nodes = model.nodes
		.filter((item) => item.scope === scope)
		.sort(
			(a, b) =>
				b.node.range.level - a.node.range.level ||
				a.node.range.start - b.node.range.start,
		);
	const live = model.records.filter(
		(record) => record.scope === scope && record.state === "live",
	);
	const covered = (pos: number) =>
		nodes.some(
			(item) =>
				item.clean &&
				pos >= item.node.range.start &&
				pos < item.node.range.start + 2 ** item.node.range.level,
		);
	const outside = live.filter((record) => !covered(record.pos));
	const frontier = panel(
		"Frontier",
		`${nodes.length} nodes · ${live.length} live`,
	);
	const body = element("div", "", "body");
	const coverage = element("div", "", "coverage");
	for (const item of nodes) {
		const cell = element("i", "", item.clean ? "b" : "d");
		cell.title = `${rangeAddress(item.scope, item.node.range)} · ${item.clean ? "clean" : "dirty"}`;
		coverage.append(cell);
	}
	for (const record of outside) {
		const cell = element("i");
		cell.title = `${address(record)} · outside`;
		coverage.append(cell);
	}
	body.append(
		coverage,
		append(
			element("div", "", "legend"),
			element("span", "clean", "lr"),
			element("span", "dirty", "ld"),
			element("span", "outside"),
		),
	);
	for (const item of nodes) {
		const target = rangeAddress(item.scope, item.node.range);
		const line = frontierLine(
			target,
			item.node.summary,
			item.node.chars,
			item.node.range.level,
		);
		if (!item.clean) line.classList.add("pending");
		if (selected?.target === target) line.classList.add("sel");
		body.append(line);
	}
	for (const record of live) {
		const target = address(record);
		const line = frontierLine(
			target,
			record.body,
			record.body.length,
			0,
			`line${outside.some((item) => item.pos === record.pos) ? " dim" : ""}`,
		);
		if (selected?.target === target) line.classList.add("sel");
		body.append(line);
	}
	frontier.append(body);
	const layout = element("div", "", "split");
	layout.append(frontier, inspector());
	main.append(layout);
	if (selected?.result.kind === "children")
		renderKids(main, selected.target, selected.result);
}
// #endregion FUNC_renderTree

function frontierLine(
	target: string,
	text: string,
	chars: number,
	level: number,
	extra = "",
) {
	const node = button(
		"",
		() => openTarget(target),
		`line l${Math.min(level, 5)}${extra}`,
	);
	node.append(
		element("span", target, "id"),
		element("span", text || "not summarized yet", "tx"),
		element("span", `${chars}`, "len"),
	);
	node.title = text;
	return node;
}
function renderKids(main: HTMLElement, target: string, result: OpenChildren) {
	const kids = panel(`Children · ${target}`, `${result.children.length} lines`);
	const body = element("div", "", "body");
	for (const child of result.children) body.append(childLine(child));
	kids.append(body);
	main.append(kids);
}
function childLine(child: OpenLine) {
	const node = button("", () => openTarget(child.addr), "line range");
	node.append(
		element("span", child.addr, "id"),
		element(
			"span",
			child.built ? child.text : `${child.ts_from} → ${child.ts_to}`,
			"tx",
		),
		element("span", String(child.chars), "len"),
	);
	if (!child.built) node.classList.add("pending");
	node.title = child.text;
	return node;
}

// #region FUNC_inspector
/**
 * @purpose Show the selected note or range with provenance and record actions in one panel.
 * @invariants Quote the body and the document as text. Show the provenance keys. Disable delete without host permission.
 */
function inspector(): HTMLElement {
	const node = panel(
		selected?.target ?? "Inspector",
		selected ? "" : "select a line",
	);
	node.classList.add("ins");
	if (!selected) {
		node.append(
			append(
				element("div", "", "body"),
				element(
					"p",
					"Click a frontier line, a record, or a search hit to open it here.",
					"muted",
				),
			),
		);
		return node;
	}
	const { result } = selected;
	const body = element("div", "", "body");
	if (result.kind === "children") {
		body.append(element("p", "This range has no built summary.", "muted"));
		for (const child of result.children) body.append(childLine(child));
		node.append(body);
		return node;
	}
	const record = model?.records.find((item) => item.id === result.id);
	const head = node.querySelector(".head .t");
	if (head) head.textContent = result.addr;
	const quote = element("div", "", "quote");
	quote.append(document.createTextNode(result.body));
	if (result.longform) quote.append(element("div", result.longform, "bodydoc"));
	body.append(quote);
	if (result.longformTruncated)
		body.append(
			element(
				"p",
				`The document is partial: ${result.longformOffset} of ${result.longformChars} characters. Select its scope to edit this record.`,
				"banner",
			),
		);
	body.append(element("div", "Provenance", "lbl"));
	body.append(
		kv([
			["id", result.id],
			["ts", result.ts],
			["kind", record?.kind ?? "unavailable"],
			["session", record?.session ?? "unavailable"],
			["preset", record?.preset ?? "unavailable"],
			["refs", result.refs.join(", ") || "none"],
			["supersedes", record?.supersedes.join(", ") || "none"],
			["superseded by", record?.superseded_by ?? "none"],
			["review at", result.review_at ?? "none"],
		]),
	);
	body.append(recordActions(result.addr, record));
	body.append(
		append(
			element("div", "", "actions"),
			button("Copy the id", async () => {
				await navigator.clipboard.writeText(result.id);
				message("ID copied.");
			}),
			button("Open in the tree", async () => {
				if (scope !== result.scope) await reset(result.scope);
				screen = 1;
				render();
			}),
		),
	);
	node.append(body);
	return node;
}
// #endregion FUNC_inspector

function recordActions(target: string, record?: ProjectionRecord) {
	const row = element("div", "", "actions");
	row.append(
		button("Reviewed", () => action("review", { target })),
		button("Amend", () => editTarget(target, false)),
		button("Supersede", () => editTarget(target, true)),
		button("Forget", async () => {
			if (confirm(`Forget ${target}?`)) await action("forget", { target });
		}),
	);
	const remove = button(
		"Delete",
		async () => {
			if (confirm(`Permanently erase the content of ${target}?`))
				await action("delete", { target, confirm: true });
		},
		"danger",
	);
	remove.disabled = !model?.allowDelete || record?.state === "deleted";
	row.append(remove);
	return row;
}
async function editTarget(target: string, supersede: boolean) {
	const record = model?.records.find((item) => address(item) === target);
	if (record) {
		noteDialog(record, supersede ? target : "");
		return;
	}
	const result = await request<OpenEntry | OpenChildren>(
		`/api/open?${params({ target })}`,
	);
	if (result.kind !== "entry") throw new Error("Select a record.");
	if (result.longformTruncated)
		throw new Error(
			"The document is partial. Select its scope before you edit this record.",
		);
	noteDialog(result, supersede ? target : "");
}

// #region FUNC_openTarget
/** @purpose Expand a range or inspect a note, and keep the selection for the inspector. */
async function openTarget(target: string): Promise<void> {
	const token = generation;
	const result = await request<OpenEntry | OpenChildren>(
		`/api/open?${params({ target })}`,
	);
	if (token !== generation) return;
	console.debug("Console target opened", {
		event: "open",
		target,
		kind: result.kind,
	});
	selected = { target, result };
	if (result.kind === "children" && screen !== 1 && screen !== 3) screen = 1;
	render();
}
// #endregion FUNC_openTarget

// #region FUNC_renderMap
/** @purpose Show the catalog lines as a timeline beside the catalog nodes and their budget. */
function renderMap(main: HTMLElement): void {
	if (!model) return;
	main.append(
		element(
			"p",
			"Catalog lines use the shared directions budget. The rule that reduces old node groups is not exposed by this API.",
			"sub",
		),
	);
	const layout = element("div", "", "split");
	const list = panel(
		"Catalog frontier",
		`${model.budgets.directions.used} / ${model.budgets.directions.limit} lines`,
	);
	const body = element("div", "", "body");
	const timeline = element("div", "", "timeline");
	for (const line of model.catalog) {
		const row = element("div", "", "tl");
		const label =
			line.kind === "record"
				? `#${line.pos}`
				: `#${line.range.start}-${line.range.start + 2 ** line.range.level - 1}`;
		const when = element("div", "", "when");
		when.append(
			document.createTextNode(`${label} `),
			element("span", `${line.from.slice(0, 10)} → ${line.to.slice(0, 10)}`),
		);
		const what = element("div", "", "what");
		const text =
			line.kind === "record"
				? line.body
				: line.kind === "summary"
					? line.summary
					: "";
		what.append(text || element("span", "unbuilt range", "dim"));
		row.append(when, what);
		timeline.append(row);
	}
	if (!model.catalog.length)
		body.append(element("p", "The catalog is empty.", "muted"));
	body.append(timeline);
	list.append(body);
	const nodes = model.nodes.filter((item) =>
		item.scope.startsWith("__catalog__:"),
	);
	const detail = panel("Catalog nodes", String(nodes.length));
	const detailBody = append(
		element("div", "", "body"),
		bar("directions", model.budgets.directions),
		element("div", "", "rail-sep"),
		table(
			["Range", "Dates", "Chars", "State"],
			nodes.map((item) => [
				rangeAddress(item.scope, item.node.range),
				`${item.node.ts_from} → ${item.node.ts_to}`,
				String(item.node.chars),
				item.clean ? "clean" : "dirty",
			]),
		),
	);
	detail.append(detailBody);
	layout.append(list, detail);
	main.append(layout);
}
// #endregion FUNC_renderMap

// #region FUNC_renderSearch
/**
 * @purpose Keep search filters explicit and highlight query words without HTML injection.
 * @invariants Show the hit count. Open one hit in the inspector beside the result list.
 */
function renderSearch(main: HTMLElement): void {
	if (!model) return;
	const words = input(query);
	words.spellcheck = false;
	const scopes = select(
		model.scopes.map((item) => item.key),
		scope,
	);
	const kinds = select(
		["", "decision", "preference", "fact", "task", "note"],
		kind,
	);
	const date = input(since, "date");
	const cap = input(limit, "number");
	cap.min = "1";
	cap.max = "50";
	const find = button("Find", search, "pri");
	const searchbar = element("div", "", "searchbar");
	searchbar.append(words, find);
	words.addEventListener("keydown", (event) => {
		if (event.key === "Enter") run(search);
	});
	async function search() {
		query = words.value;
		kind = kinds.value;
		since = date.value;
		limit = cap.value;
		const token = generation;
		const found = await request<IndexHit[]>(
			`/api/search?${params({ scope: scopes.value, query, kind, since, limit })}`,
		);
		if (token !== generation) return;
		hits = found;
		console.debug("Console search", { event: "search", hits: hits.length });
		render();
	}
	const filters = element("div", "", "filters");
	for (const [name, control] of [
		["scope", scopes],
		["kind", kinds],
		["since", date],
		["limit", cap],
	] as const) {
		const wrap = element("label");
		wrap.append(element("span", name), control);
		filters.append(wrap);
	}
	main.append(searchbar, filters);
	const layout = element("div", "", "split");
	const list = panel(
		`${hits.length} matches`,
		`${scopes.value || "all scopes"}`,
	);
	for (const hit of hits) {
		const node = button("", () => openTarget(hit.addr), "hit");
		node.append(
			element("span", hit.addr, "id"),
			element("span", hit.kind, "kind"),
			highlight(hit.body),
			element("span", hit.ts.slice(0, 10), "when"),
		);
		list.append(node);
	}
	if (!hits.length) list.append(element("p", "No matches yet.", "muted body"));
	layout.append(list, inspector());
	main.append(layout);
}
// #endregion FUNC_renderSearch

function highlight(body: string) {
	const node = element("span", "", "tx");
	const tokens = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
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
			element("mark", body.slice(match.at, match.at + match.word.length)),
		);
		offset = match.at + match.word.length;
	}
	return node;
}

// #region FUNC_renderReview
/** @purpose List the due records with their review dates, periods, and record actions. */
function renderReview(main: HTMLElement): void {
	if (!model) return;
	main.append(
		element(
			"p",
			"Review work is for a human. These records stay out of the session slice.",
			"sub",
		),
	);
	const list = panel(`Due · ${model.review.length}`, "review_at <= today");
	list.append(
		table(
			["Address", "Text", "Kind", "Review date", "Actions"],
			model.review.map((item) => [
				button(item.addr, () => openTarget(item.addr)),
				item.body,
				item.kind,
				item.review_at ?? "none",
				recordActions(item.addr),
			]),
		),
	);
	main.append(list);
	const policy = panel(
		"Review periods",
		`${Object.keys(model.reviewPolicy).length} kinds`,
	);
	policy.append(
		append(
			element("div", "", "body"),
			kv(
				Object.entries(model.reviewPolicy).map(([name, days]) => [
					name,
					`${days} days`,
				]),
			),
		),
	);
	main.append(policy);
}
// #endregion FUNC_renderReview

// #region FUNC_renderProposals
/** @purpose Show each pending proposal with its session, scope, age, and explicit decision. */
function renderProposals(main: HTMLElement): void {
	main.append(
		element(
			"p",
			"Accept applies the proposed change through the ordinary write rules. Dismiss closes the proposal and changes no record.",
			"sub",
		),
	);
	const list = panel(`Waiting · ${model?.proposals.length ?? 0}`, "proposed");
	list.append(
		table(
			["ID", "Child session", "Text", "Scope", "Age", "Decision"],
			(model?.proposals ?? []).map((item) => [
				item.id,
				"session" in item ? item.session : "unavailable",
				"body" in item ? (item.body ?? "") : item.op,
				item.scope,
				age(item.at),
				append(
					element("div", "", "actions"),
					button("Accept", () => action("accept", { target: item.id }), "pri"),
					button("Dismiss", () => action("dismiss", { target: item.id })),
				),
			]),
		),
	);
	main.append(list);
}
// #endregion FUNC_renderProposals

// #region FUNC_renderMaintenance
/** @purpose Expose build candidates and let a user submit scope and catalog answers. */
function renderMaintenance(main: HTMLElement): void {
	if (!model) return;
	main.append(
		element(
			"p",
			"The tree is a cache. Writer runtime, local attempts, and backoff are unavailable in this host.",
			"sub",
		),
	);
	const tiles = element("div", "", "tiles");
	tiles.append(
		tile(String(model.records.length), "records"),
		tile(String(model.nodes.length), "tree nodes"),
		tile(
			String(model.candidates.length),
			"merge candidates",
			model.candidates.length > 0,
		),
		tile("0", "failed builds"),
	);
	main.append(tiles);
	const budgets = panel("Line budgets");
	budgets.append(
		append(
			element("div", "", "body bars"),
			bar("here", model.budgets.here),
			bar("directions", model.budgets.directions),
		),
	);
	main.append(budgets);
	const list = panel("Merge candidates", "dirty ranges");
	list.append(
		table(
			["Scope", "Range", "Level", "State"],
			model.candidates.map((item) => [
				item.scope,
				rangeAddress(item.scope, item.range),
				String(item.range.level),
				item.ready ? "ready" : "waiting for children",
			]),
		),
	);
	main.append(list);
	const levels = [
		...new Set([
			...model.nodes.map((item) => item.node.range.level),
			...model.candidates.map((item) => item.range.level),
		]),
	].sort((a, b) => a - b);
	const data = model;
	const perLevel = panel("Nodes by level");
	perLevel.append(
		table(
			["Level", "Nodes", "Dirty", "Candidate holes"],
			levels.map((level) => [
				String(level),
				String(
					data.nodes.filter((item) => item.node.range.level === level).length,
				),
				String(
					data.nodes.filter(
						(item) => item.node.range.level === level && !item.clean,
					).length,
				),
				String(
					data.candidates.filter((item) => item.range.level === level).length,
				),
			]),
		),
	);
	main.append(perLevel);
	const jobs = panel("Compaction", "answers go through store validation");
	const jobBody = element("div", "", "body");
	for (const catalog of [false, true])
		jobBody.append(
			button(
				catalog ? "Prepare catalog job" : "Prepare scope job",
				async () => {
					const context = { profile, scope, catalog };
					const result = (await action("compact", { catalog })) as {
						job: string;
						inputs: BuildInput[];
					};
					if (!result || !Array.isArray(result.inputs))
						throw new Error("Invalid compact response.");
					compact = { ...result, ...context };
					render();
				},
				"pri",
			),
		);
	jobs.append(jobBody);
	main.append(jobs);
	if (compact) {
		const job = compact;
		const task = panel(
			`Compact job · ${job.job.slice(0, 24)}…`,
			`${job.inputs.length} inputs`,
		);
		const body = element("div", "", "body");
		const inputs = element("details");
		inputs.append(element("summary", "Copied inputs"));
		inputs.append(element("pre", JSON.stringify(job.inputs, null, 2)));
		const answers = element("textarea");
		answers.rows = 6;
		answers.spellcheck = false;
		answers.placeholder = "#0-1: Summary text\n#2-3: Summary text";
		const apply = button(
			"Apply compact answers",
			async () => {
				if (!answers.value.trim()) throw new Error("Enter compact answers.");
				if (profile !== job.profile || scope !== job.scope)
					throw new Error("Select the profile and scope of this job first.");
				const result = (await action("compact-answer", {
					catalog: job.catalog,
					inputs: job.inputs,
					answers: answers.value,
				})) as { built: number; rejected: number };
				compact = result.rejected ? job : undefined;
				render();
				message(
					`Built ${result.built} summaries. Rejected ${result.rejected} answers.${result.rejected ? " Prepare a new job from the current tree." : ""}`,
					result.rejected > 0,
				);
			},
			"pri",
		);
		apply.disabled = profile !== job.profile || scope !== job.scope;
		body.append(
			inputs,
			field(`Answers · ${job.profile} · ${job.scope}`, answers),
			apply,
		);
		task.append(body);
		main.append(task);
	}
}
// #endregion FUNC_renderMaintenance

async function scopeAction(remove: boolean) {
	if (
		!confirm(
			`${remove ? "Permanently delete all content in" : "Forget all records in"} ${scope}?`,
		)
	)
		return;
	await action(remove ? "scope-delete" : "scope-forget", { confirm: true });
}

// #region FUNC_noteDialog
/**
 * @purpose Create, amend, or supersede a record with explicit user input.
 * @invariants Show body, character count, longform, scope, kind, and comma-separated supersedes addresses.
 * New scopes start with a note. Amend keeps the record kind and scope. The native dialog handles focus and Escape.
 */
function noteDialog(
	record?: ProjectionRecord | OpenEntry,
	supersedes = "",
	newScope = false,
): void {
	const dialog = element("dialog"),
		form = element("form");
	const amend = record !== undefined && !supersedes;
	dialog.append(
		append(
			element("div", "", "head"),
			element("span", amend ? "Amend record" : t(7), "t"),
		),
	);
	const note = element("textarea");
	note.value = record?.body ?? "";
	note.required = true;
	note.rows = 3;
	note.spellcheck = false;
	const counter = element("div", "0 characters", "counter");
	const update = () => {
		counter.textContent = `${note.value.length} characters`;
	};
	note.oninput = update;
	update();
	const longform = element("textarea");
	longform.value = record?.longform ?? "";
	longform.rows = 6;
	longform.spellcheck = false;
	const scopeInput = input(newScope ? "" : (record?.scope ?? scope));
	scopeInput.required = true;
	scopeInput.pattern = "[^:]+:[^:]+";
	scopeInput.placeholder = "project:example";
	scopeInput.disabled = amend;
	const kindInput = select(
		["decision", "preference", "fact", "task", "note"],
		record && "state" in record ? record.kind : "note",
	);
	kindInput.disabled = amend;
	const replace = input(supersedes);
	replace.spellcheck = false;
	replace.disabled = amend;
	const noteField = field("Body · one line", note);
	noteField.append(counter);
	const scopeField = field("Scope", scopeInput);
	scopeField.append(
		element("div", "A new scope starts with this note.", "hint"),
	);
	const replaceField = field("Supersedes · comma-separated addresses", replace);
	form.append(
		noteField,
		field("Longform document", longform),
		append(element("div", "", "row2"), scopeField, field("Kind", kindInput)),
		replaceField,
	);
	const save = button(
		amend ? "Save changes" : "Create record",
		() => {},
		"pri",
	);
	save.type = "submit";
	form.append(
		append(
			element("div", "", "dlg-foot"),
			button("Cancel", () => dialog.close(), "ghost"),
			save,
		),
	);
	form.onsubmit = (event) => {
		event.preventDefault();
		run(async () => {
			save.disabled = true;
			try {
				await action(amend ? "amend" : "note", {
					scope: scopeInput.value,
					body: note.value,
					longform: longform.value,
					...(amend
						? { target: address(record) }
						: { kind: kindInput.value as NoteKind, supersedes: replace.value }),
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
		screen = Number(event.key) - 1;
		render();
	}
});

run(reload);

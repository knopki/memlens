/**
 * #region moduleContract
 * @purpose Let users inspect and maintain memory through seven browser screens.
 * @scope Native DOM controls and the standalone HTTP API.
 * @invariants Render store text as text. Keep destructive actions explicit. Never claim unavailable session state.
 * @dependencies GET view, search, open and POST action from the CLI host.
 * #endregion moduleContract
 */

import type { ConsoleModel } from "../../core/src/domain/console.js";
import type { OpenChildren, OpenEntry } from "../../core/src/domain/reads.js";
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
let compact:
	| {
			job: string;
			inputs: BuildInput[];
			profile: string;
			scope: string;
			catalog: boolean;
	  }
	| undefined;
const opened = new Map<string, OpenEntry | OpenChildren>();
const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Console root is absent");
const status = element("div");
status.id = "status";
status.setAttribute("role", "status");
status.setAttribute("aria-live", "polite");
const shell = element("div");
app.append(status, shell);
const t = (index: number) => labels[locale][index] ?? labels.en[index] ?? "";
const address = (record: { scope: string; pos: number }) =>
	`${record.scope}#${record.pos}`;
const rangeAddress = (key: string, range: Range) =>
	`${key}#${range.start}-${range.start + 2 ** range.level - 1}`;
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
	const node = element("button", text, className);
	node.type = "button";
	node.addEventListener("click", () => run(fn));
	return node;
}
function field(text: string, input: HTMLElement) {
	return append(element("label", text), input);
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
function card(title: string, text?: string) {
	const node = append(element("section", "", "card"), element("h3", title));
	if (text !== undefined) node.append(element("pre", text));
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
	if (!rows.length) wrap.append(element("p", "No entries.", "muted"));
	return wrap;
}
function budget(name: string, value: { used: number; limit: number }) {
	const meter = element("meter");
	meter.min = 0;
	meter.max = Math.max(1, value.limit);
	meter.value = value.used;
	meter.setAttribute(
		"aria-label",
		`${name}: ${value.used} of ${value.limit} lines`,
	);
	return append(
		element("div", "", "budget"),
		element("span", `${name} · ${value.used} / ${value.limit} lines`),
		meter,
	);
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
		opened.clear();
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
 * @purpose Keep the chrome and current screen consistent with the latest model.
 * @invariants Show the profile, backend, dirty ranges, and both budgets in the header.
 * Show seven numbered screens, scopes, and scope actions in the rail. Disable delete without host permission.
 * Show the store path, scope, revision, and unavailable session and writer state in the footer.
 */
function render(): void {
	if (!model) return;
	document.documentElement.lang = locale;
	shell.replaceChildren();
	const header = append(element("header"), element("h1", "memlens"));
	const profiles = select(model.profiles, profile);
	profiles.onchange = () =>
		run(async () => {
			profile = profiles.value;
			scope = "";
			opened.clear();
			hits = [];
			await reload();
		});
	const languages = select(Object.keys(labels), locale);
	languages.setAttribute("aria-label", "Language");
	languages.onchange = () => {
		locale = languages.value as Locale;
		render();
	};
	header.append(
		field(t(11), profiles),
		languages,
		element("span", model.backend, "muted"),
		element("span", `${model.candidates.length} dirty ranges`, "muted"),
		budget("Here", model.budgets.here),
		budget("Directions", model.budgets.directions),
		button(t(7), () => noteDialog(), "primary"),
	);
	const layout = element("div", "", "layout"),
		rail = element("aside"),
		nav = element("nav");
	nav.setAttribute("aria-label", "Screens");
	for (let index = 0; index < 7; index++) {
		const item = button(
			`${index + 1}  ${t(index)}`,
			() => {
				screen = index;
				render();
			},
			screen === index ? "active" : "",
		);
		if (screen === index) item.setAttribute("aria-current", "page");
		nav.append(item);
	}
	rail.append(nav, element("h3", "Scopes"));
	const scopes = element("div", "", "scope-list");
	for (const item of model.scopes)
		scopes.append(
			button(
				item.key,
				async () => {
					scope = item.key;
					opened.clear();
					hits = [];
					await reload();
				},
				item.key === scope ? "active" : "",
			),
		);
	const remove = button(t(10), () => scopeAction(true), "danger");
	remove.disabled = !model.allowDelete;
	rail.append(
		scopes,
		append(
			element("div", "", "row"),
			button(t(8), () => noteDialog(undefined, "", true)),
			button(t(9), () => scopeAction(false)),
			remove,
		),
	);
	const main = element("main");
	main.id = "main";
	main.tabIndex = -1;
	main.append(element("h2", t(screen)));
	renderScreen(main);
	layout.append(rail, main);
	shell.append(
		header,
		layout,
		element(
			"footer",
			`${model.path} · ${scope} · ${model.scopes.length} scopes · Revision ${model.revision} · Session snapshot: unavailable · Writer runtime: unavailable`,
		),
	);
}
// #endregion FUNC_render

// #region FUNC_renderScreen
/**
 * @purpose Give each console task its own screen with the available store data.
 * @invariants Directions keeps empty scope panels, their four counts, frontier text, and the active slice.
 * Tree shows clean, dirty, and outside coverage. Range actions reveal children. Record actions open the inspector.
 * Catalog shows dated lines and catalog nodes. Review shows due dates, configured periods, and record actions.
 * Proposals show their source session, scope, age, and explicit accept and dismiss actions.
 */
function renderScreen(main: HTMLElement): void {
	if (!model) return;
	if (screen === 0) {
		main.append(
			element(
				"p",
				"Session, materialization time, and next trigger are unavailable in this standalone console.",
				"notice",
			),
		);
		const cards = element("div", "", "cards");
		for (const item of model.scopes) {
			const panel = card(item.key, item.frontier || "No frontier text.");
			if (item.key === scope) panel.classList.add("selected");
			panel.append(
				element(
					"p",
					`Total ${item.total} · Live ${item.live} · Hidden ${item.hidden} · Deleted ${item.deleted}`,
					"muted",
				),
				button("Open scope", async () => {
					scope = item.key;
					await reload();
				}),
			);
			cards.append(panel);
		}
		main.append(
			cards,
			card("Active scope · Here", model.here),
			card("Directions", model.directions),
			card("Materialized slice", model.text),
		);
	} else if (screen === 1) {
		main.append(
			element("p", "Coverage: clean · dirty · outside the tree", "muted"),
		);
		const coverage = element("div", "", "coverage");
		for (const item of model.nodes.filter((item) => item.scope === scope)) {
			const target = rangeAddress(item.scope, item.node.range);
			coverage.append(
				button(
					`${target} · ${item.clean ? "clean" : "dirty"}`,
					() => openTarget(target),
					item.clean ? "clean" : "dirty",
				),
			);
		}
		for (const record of model.records.filter(
			(record) => record.scope === scope && record.state === "live",
		)) {
			if (
				!model.nodes.some(
					(item) =>
						item.scope === scope &&
						item.clean &&
						record.pos >= item.node.range.start &&
						record.pos < item.node.range.start + 2 ** item.node.range.level,
				)
			)
				coverage.append(
					button(
						`${address(record)} · outside`,
						() => openTarget(address(record)),
						"outside",
					),
				);
		}
		main.append(
			coverage,
			card(
				"Frontier",
				model.scopes.find((item) => item.key === scope)?.frontier ??
					"No frontier.",
			),
		);
		for (const item of model.nodes.filter((item) => item.scope === scope))
			main.append(
				treeLine(
					rangeAddress(scope, item.node.range),
					item.node.summary,
					item.node.chars,
				),
			);
		const records = card("Records");
		for (const record of model.records.filter(
			(record) => record.scope === scope,
		))
			records.append(
				button(
					`${address(record)} · ${record.state} · ${record.body}`,
					() => openTarget(address(record)),
					"line",
				),
			);
		main.append(records);
		for (const [target, result] of opened)
			if (result.kind === "children") {
				const panel = card(target);
				for (const child of result.children)
					panel.append(
						treeLine(
							child.addr,
							`${child.built ? "" : "Unbuilt · "}${child.text || `${child.ts_from} → ${child.ts_to}`}`,
							child.chars,
						),
					);
				main.append(panel);
			}
	} else if (screen === 2) {
		main.append(
			budget("Directions", model.budgets.directions),
			element(
				"p",
				"Catalog lines use the shared slice budget. Node age rules are not exposed by this API.",
				"notice",
			),
		);
		main.append(
			table(
				["Key", "From", "To", "Summary"],
				model.catalog.map((line, index) => [
					String(index),
					line.from,
					line.to,
					"body" in line
						? line.body
						: "summary" in line
							? line.summary
							: "Unbuilt range",
				]),
			),
		);
		main.append(
			table(
				["Scope / range", "Date", "Characters", "State"],
				model.nodes
					.filter((item) => item.scope.startsWith("__catalog__:"))
					.map((item) => [
						rangeAddress(item.scope, item.node.range),
						`${item.node.ts_from} → ${item.node.ts_to}`,
						String(item.node.chars),
						item.clean ? "clean" : "dirty",
					]),
			),
		);
	} else if (screen === 3) renderSearch(main);
	else if (screen === 4) {
		main.append(
			element(
				"p",
				`Review periods: ${Object.entries(model.reviewPolicy)
					.map(([name, days]) => `${name}: ${days} days`)
					.join(" · ")}.`,
				"notice",
			),
		);
		main.append(
			table(
				["Address", "Note date", "Text", "Kind", "Review date", "Actions"],
				model.review.map((item) => [
					button(item.addr, () => openTarget(item.addr)),
					item.ts,
					item.body,
					item.kind,
					item.review_at ?? "None",
					recordActions(item.addr),
				]),
			),
		);
	} else if (screen === 5) {
		main.append(
			element(
				"p",
				"Accept applies the proposed change. Dismiss closes the proposal without a record change.",
				"notice",
			),
		);
		main.append(
			table(
				["ID", "Child session", "Text", "Scope", "Age", "Actions"],
				model.proposals.map((item) => [
					item.id,
					"session" in item ? item.session : "Unavailable",
					"body" in item ? (item.body ?? "") : item.op,
					item.scope,
					`${Math.max(0, Math.floor((Date.now() - Date.parse(item.at)) / 86400000))} days`,
					append(
						element("div", "", "row"),
						button("Accept", () => action("accept", { target: item.id })),
						button("Dismiss", () => action("dismiss", { target: item.id })),
					),
				]),
			),
		);
	} else renderMaintenance(main);
}
// #endregion FUNC_renderScreen

function treeLine(target: string, text: string, chars: number) {
	return button(
		`${target} · ${chars} chars\n${text}`,
		() => openTarget(target),
		"line",
	);
}
async function scopeAction(remove: boolean) {
	if (
		!confirm(
			`${remove ? "Permanently delete all content in" : "Forget all records in"} ${scope}?`,
		)
	)
		return;
	await action(remove ? "scope-delete" : "scope-forget", { confirm: true });
}
function recordActions(target: string) {
	const row = element("div", "", "row");
	const record = model?.records.find((item) => address(item) === target);
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
/** @purpose Expand a range or inspect a note through the host read API. */
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
	opened.set(target, result);
	if (result.kind === "children") {
		screen = 1;
		render();
		return;
	}
	inspect(result);
}
// #endregion FUNC_openTarget

// #region FUNC_inspect
/** @purpose Expose note content, provenance, relatives, and record actions in one native dialog. */
function inspect(entry: OpenEntry): void {
	const dialog = element("dialog"),
		record = model?.records.find((item) => item.id === entry.id);
	dialog.setAttribute("aria-label", entry.addr);
	dialog.append(
		element("h2", entry.addr),
		element("pre", entry.body),
		element("h3", "Document"),
		element("pre", entry.longform || "No document."),
	);
	if (entry.longformTruncated)
		dialog.append(
			element(
				"p",
				`Document is partial: ${entry.longformOffset} of ${entry.longformChars} characters.`,
				"notice",
			),
		);
	const provenance = {
		id: entry.id,
		ts: entry.ts,
		session: record?.session ?? "Unavailable",
		preset: record?.preset ?? "Unavailable",
		kind: record?.kind ?? "Unavailable",
		refs: entry.refs,
		supersedes: record?.supersedes ?? "Unavailable",
		superseded_by: record?.superseded_by ?? null,
	};
	dialog.append(
		card("Provenance and relatives", JSON.stringify(provenance, null, 2)),
		recordActions(entry.addr),
	);
	dialog.append(
		append(
			element("div", "", "row"),
			button("Copy the id", async () => {
				await navigator.clipboard.writeText(entry.id);
				message("ID copied.");
			}),
			button("Open in the tree", async () => {
				dialog.close();
				if (scope !== entry.scope) {
					scope = entry.scope;
					await reload();
				}
				screen = 1;
				render();
			}),
			button("Close", () => dialog.close()),
		),
	);
	dialog.addEventListener("close", () => dialog.remove());
	document.body.append(dialog);
	dialog.showModal();
}
// #endregion FUNC_inspect

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
	dialog.setAttribute("aria-label", amend ? "Amend record" : t(7));
	const body = element("textarea");
	body.value = record?.body ?? "";
	body.required = true;
	body.rows = 4;
	const count = element("small");
	const update = () => {
		count.textContent = `${body.value.length} characters`;
	};
	body.oninput = update;
	update();
	const longform = element("textarea");
	longform.value = record?.longform ?? "";
	longform.rows = 7;
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
	replace.disabled = amend;
	const save = element(
		"button",
		amend ? "Save changes" : "Create record",
		"primary",
	);
	save.type = "submit";
	form.append(
		element("h2", amend ? "Amend record" : t(7)),
		field("Body", body),
		count,
		field("Longform document", longform),
		field("Scope", scopeInput),
		field("Kind", kindInput),
		field("Supersedes · comma-separated addresses", replace),
		append(
			element("div", "", "row"),
			button("Cancel", () => dialog.close()),
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
					body: body.value,
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
	body.focus();
}
// #endregion FUNC_noteDialog

// #region FUNC_renderSearch
/** @purpose Keep search filters explicit and highlight query words without HTML injection. */
function renderSearch(main: HTMLElement): void {
	const form = element("form", "", "filters"),
		words = input(query),
		kinds = select(
			["", "decision", "preference", "fact", "task", "note"],
			kind,
		),
		date = input(since, "date"),
		cap = input(limit, "number");
	cap.min = "1";
	cap.max = "50";
	const scopes = select(model?.scopes.map((item) => item.key) ?? [], scope);
	const submit = element("button", "Find", "primary");
	submit.type = "submit";
	form.append(
		field("Words", words),
		field("Scope", scopes),
		field("Kind", kinds),
		field("Since", date),
		field("Limit", cap),
		submit,
	);
	form.onsubmit = (event) => {
		event.preventDefault();
		run(async () => {
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
		});
	};
	main.append(form, element("p", `${hits.length} matches`, "muted"));
	const tokens = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
	main.append(
		table(
			["Address", "Kind", "Text", "Date"],
			hits.map((hit) => {
				const text = element("span"),
					body = hit.body,
					lower = body.toLocaleLowerCase();
				let offset = 0;
				while (offset < body.length) {
					const match = tokens
						.map((word) => ({ at: lower.indexOf(word, offset), word }))
						.filter((item) => item.at >= 0)
						.sort((a, b) => a.at - b.at)[0];
					if (!match) {
						text.append(document.createTextNode(body.slice(offset)));
						break;
					}
					text.append(
						document.createTextNode(body.slice(offset, match.at)),
						element("mark", body.slice(match.at, match.at + match.word.length)),
					);
					offset = match.at + match.word.length;
				}
				return [
					button(hit.addr, () => openTarget(hit.addr)),
					hit.kind,
					text,
					hit.ts,
				];
			}),
		),
	);
}
// #endregion FUNC_renderSearch

// #region FUNC_renderMaintenance
/** @purpose Expose build candidates and let users submit scope and catalog answers. */
function renderMaintenance(main: HTMLElement): void {
	if (!model) return;
	const tiles = element("div", "", "cards");
	for (const [title, value] of [
		["Notes", model.records.length],
		["Nodes", model.nodes.length],
		["Candidates", model.candidates.length],
		["Failed builds", "Unavailable"],
	] as const)
		tiles.append(card(title, String(value)));
	main.append(tiles);
	main.append(
		append(
			element("div", "", "row"),
			budget("Here", model.budgets.here),
			budget("Directions", model.budgets.directions),
		),
		element(
			"p",
			"Writer runtime, attempts, and backoff are unavailable. Candidates come from the current tree. Local writer state resets after restart.",
			"notice",
		),
	);
	main.append(
		table(
			["Scope", "Range", "Level", "State"],
			model.candidates.map((item) => [
				item.scope,
				rangeAddress(item.scope, item.range),
				String(item.range.level),
				item.ready ? "Ready" : "Waiting for children",
			]),
		),
	);
	const levels = [
		...new Set([
			...model.nodes.map((item) => item.node.range.level),
			...model.candidates.map((item) => item.range.level),
		]),
	].sort((a, b) => a - b);
	main.append(
		table(
			["Level", "Nodes", "Dirty nodes", "Candidate holes"],
			levels.map((level) => [
				String(level),
				String(
					model?.nodes.filter((item) => item.node.range.level === level).length,
				),
				String(
					model?.nodes.filter(
						(item) => item.node.range.level === level && !item.clean,
					).length,
				),
				String(
					model?.candidates.filter((item) => item.range.level === level).length,
				),
			]),
		),
	);
	for (const catalog of [false, true])
		main.append(
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
				"primary",
			),
		);
	if (compact) {
		const job = compact,
			panel = card(
				`Compact job · ${job.job}`,
				JSON.stringify(job.inputs, null, 2),
			),
			answers = element("textarea");
		answers.rows = 7;
		answers.placeholder = "#0-1: Summary text\n#2-3: Summary text";
		panel.append(
			element(
				"p",
				`${job.profile} · ${job.scope} · ${job.inputs.length} inputs`,
			),
			field("Answers · one #a-b: text line per range", answers),
		);
		const apply = button("Apply compact answers", async () => {
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
		});
		apply.disabled = profile !== job.profile || scope !== job.scope;
		panel.append(apply);
		main.append(panel);
	}
}
// #endregion FUNC_renderMaintenance

run(reload);

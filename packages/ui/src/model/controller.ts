/**
 * #region moduleContract
 * @purpose Move the console through its host calls and its state, so a shell binds a control to one
 * callback and not to the transport or the address.
 * @scope The busy guard, the generation guard, the status line, the dialog, the address write, the
 * language and theme persistence, the runtime watch, and the reset rules. NOT: the DOM, the
 * address read, and the transport.
 * @invariants The controller reads no address. The shell gives the current route and takes the next
 * route.
 * @invariants A stale answer writes no state. One open sequence lets the latest open write the
 * selection. A second action waits for the first action.
 * @invariants Each view read names the current screen, so a screen change reads its own payload.
 * @invariants A callback reports its error in the status line and does not reject.
 * @invariants The runtime watch reads the runtime method only, so a live read reloads no view. It
 * writes no busy flag and no status text, so it does not block or clear an action.
 * @invariants One running watch holds one timer. A stop clears the timer and drops each later
 * answer of the stopped watch.
 * @keywords controller, action, busy, generation, status, dialog, reset
 * #endregion moduleContract
 */

import type { BuildInput, ConsoleEntry, NoteKind, Range } from "@memlens/core";
import { readRange, renderRange } from "../format.js";
import { LANGS, type Lang } from "../i18n.js";
import { DEFAULT_ROUTE, type Route, routeOf, type Screen } from "../route.js";
import type { Choice, Step, View } from "../types.js";
import type {
	ActionFields,
	ConsoleActions,
	ConsoleRuntime,
	ConsoleState,
	ConsoleStorage,
	DialogPayload,
	DialogState,
	SearchFilters,
	StorePort,
	Translate,
} from "./console.js";
import type { ConsoleStore } from "./store.js";

/** The storage key of the language choice. */
const LANG_KEY = "memlens.lang";

/** The storage key of the theme choice. */
const THEME_KEY = "memlens.theme";

/** The time that a success message stays on the page, in milliseconds. */
const SUCCESS_MS = 2500;

/** The time that an error message stays on the page, in milliseconds. */
const ERROR_MS = 8000;

/** The wait between two reads of the host runtime state, in milliseconds. */
const RUNTIME_MS = 5000;

function languageOf(code: string): Lang {
	const short = code.slice(0, 2) as Lang;
	return LANGS.includes(short) ? short : "en";
}

function themeOf(code: string): Choice {
	return code === "light" || code === "dark" ? code : "system";
}

// #region INTERFACE_ControllerOptions
/**
 * @purpose Hold the parts that a shell gives to one console controller.
 * @invariants The shell supplies the port, the storage, the store, the text, and the address pair.
 * @invariants The address pair reads the current route and writes the next route. The shell decides
 * whether that is the page address or an in-memory value.
 * @keywords controller, options, port, storage, route
 */
export interface ControllerOptions {
	readonly port: StorePort;
	readonly storage: ConsoleStorage;
	readonly store: ConsoleStore;
	readonly t: Translate;
	readonly readRoute: () => Route;
	readonly writeRoute: (route: Route, step: Step) => void;

	/** The clipboard writer of the shell. The default reads the page clipboard. */
	readonly clipboard?: (text: string) => Promise<void>;
}
// #endregion INTERFACE_ControllerOptions

// #region FUNC_unknownInputs
/**
 * @purpose List the answers that name a range outside one job.
 * @invariants An answer line starts with a range id and a colon.
 * @param text - The answer text of the form.
 * @param wanted - The range ids of the job.
 */
function unknownInputs(text: string, wanted: readonly string[]): string[] {
	return text
		.split("\n")
		.map((line) => /^#(\d+)-(\d+):/.exec(line.trim()))
		.filter((match) => match !== null)
		.map((match) => `#${match[1]}-${match[2]}`)
		.filter((id) => !wanted.includes(id));
}
// #endregion FUNC_unknownInputs

// #region FUNC_pageClipboard
/**
 * @purpose Read the clipboard of the page, so a shell without its own writer copies the text.
 * @invariants A page without the clipboard API gives an error, and the status line states it.
 */
function pageClipboard(): (text: string) => Promise<void> {
	return async (text: string) => {
		const clipboard =
			typeof navigator === "undefined" ? undefined : navigator.clipboard;
		if (clipboard === undefined) {
			throw new Error("The clipboard is unavailable.");
		}
		await clipboard.writeText(text);
	};
}
// #endregion FUNC_pageClipboard

// #region FUNC_createConsoleController
/**
 * @purpose Build the actions of one console from its port, its storage, its store, and its address.
 * @invariants The controller keeps one status timer. A new message cancels the old timer.
 * @invariants A view answer of an older generation writes no state.
 * @param options - The parts that the shell supplies.
 */
export function createConsoleController(
	options: ControllerOptions,
): ConsoleActions {
	const { port, storage, store, t, readRoute, writeRoute } = options;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let runtimeTimer: ReturnType<typeof setInterval> | undefined;
	let runtimeWatch = 0;
	let runtimePending: number | undefined;

	/** The number of the latest open request. A later request drops the answer of an older one. */
	let openSeq = 0;

	const get = (): ConsoleState => store.getSnapshot();
	const set = (patch: Partial<ConsoleState>): void => store.set(patch);

	// #region FUNC_message
	/**
	 * @purpose Show one status message and clear it after its time.
	 * @invariants A success clears after 2.5 seconds and an error after 8 seconds.
	 * @invariants An empty text cancels the timer and clears the status.
	 */
	function message(text: string, error = false): void {
		clearTimeout(timer);
		set({ status: { text, error } });
		if (text)
			timer = setTimeout(
				() => {
					set({ status: { text: "", error: false } });
				},
				error ? ERROR_MS : SUCCESS_MS,
			);
	}
	// #endregion FUNC_message

	// #region FUNC_report
	/**
	 * @purpose Write one failed action to the debug log and to the status line.
	 */
	function report(error: unknown): void {
		console.debug("Console action failed", {
			event: "error",
			message: String(error),
		});
		message(error instanceof Error ? error.message : String(error), true);
	}
	// #endregion FUNC_report

	// #region FUNC_guard
	/**
	 * @purpose Run one action and report its error, so a callback does not reject.
	 */
	async function guard(fn: () => unknown): Promise<void> {
		try {
			await fn();
		} catch (error) {
			report(error);
		}
	}
	// #endregion FUNC_guard

	// #region FUNC_current
	/**
	 * @purpose Read the state of the console as one route.
	 */
	function current(): Route {
		const state = get();
		return {
			screen: state.screen,
			profile: state.profile,
			scope: state.scope,
			target: state.selection?.target ?? "",
			query: state.query,
			searchScope: state.searchScope,
			kinds: state.kinds,
			since: state.since,
			until: state.until,
			due: state.due,
			limit: state.limit,
			reviewKind: state.reviewKind,
		};
	}
	// #endregion FUNC_current

	// #region FUNC_enter
	/**
	 * @purpose Put the state of the console into the address of the shell at the chosen step.
	 * @invariants A repeated route writes nothing, so a second click on the live scope adds no entry.
	 */
	function enter(step: Step): void {
		if (step === "none") return;
		const next = current();
		if (routeOf(next) === routeOf(readRoute())) return;
		writeRoute(next, step);
		console.debug("Console address", {
			event: "address",
			step,
			route: routeOf(next),
		});
	}
	// #endregion FUNC_enter

	// #region FUNC_loadView
	/**
	 * @purpose Read the model of the current scope and screen after a profile, scope, or screen
	 * change.
	 * @invariants The host resolves the profile and the scope, so the state takes the resolved values.
	 * @invariants The call names the current screen, so the host reads one screen payload only.
	 * @invariants The call keeps a generation token. An older answer writes no state and answers
	 *   false, so a caller stops its later steps.
	 * @invariants A failed view read still states the runtime of the host, so a surface reports a
	 *  store that does not open.
	 */
	async function loadView(step: Step = "replace"): Promise<boolean> {
		const token = get().generation + 1;
		set({ generation: token });
		message(t("loading"));
		let view: View | undefined;
		let failed: unknown;
		try {
			view = await port.view({
				profile: get().profile,
				scope: get().scope,
				kind: get().reviewKind,
				screen: get().screen,
			});
		} catch (error) {
			failed = error;
		}
		const runtime = port.runtime
			? await port.runtime().catch(() => undefined)
			: undefined;
		if (token !== get().generation) return false;
		if (runtime !== undefined) set({ runtime });
		if (failed !== undefined) throw failed;
		if (!view || !Array.isArray(view.scopes)) throw new Error(t("badView"));
		set({ model: view, profile: view.profile, scope: view.scope });
		console.debug("Console loaded", {
			event: "view",
			profile: view.profile,
			scope: view.scope,
			screen: view.screen,
			revision: view.revision,
		});
		enter(step);
		message("");
		return true;
	}
	// #endregion FUNC_loadView

	// #region FUNC_refreshRuntime
	/**
	 * @purpose Read the host runtime state and put it on the page, without a view read.
	 * @invariants A read without a runtime method, a failed read, and a read of an older watch write
	 *  no state.
	 * @invariants A read that waits keeps the earlier state. The next read starts after it ends.
	 * @param token - The number of the watch that asks for the read.
	 */
	async function refreshRuntime(token: number): Promise<void> {
		const read = port.runtime;
		if (read === undefined || runtimePending === token) return;
		runtimePending = token;
		let value: ConsoleRuntime | undefined;
		try {
			value = await read().catch(() => undefined);
		} finally {
			if (runtimePending === token) runtimePending = undefined;
		}
		if (value === undefined || token !== runtimeWatch) return;
		set({ runtime: value });
		console.debug("Console runtime", {
			event: "runtime",
			attempts: value.compaction?.attempts,
			dirty: value.compaction?.dirty,
			events: value.compaction?.events.length,
		});
	}
	// #endregion FUNC_refreshRuntime

	// #region FUNC_watchRuntime
	/**
	 * @purpose Start or stop the live read of the host runtime state.
	 * @invariants A second start keeps the running watch, so a render adds no timer.
	 * @invariants A host without a runtime method keeps no timer, so the standalone console is idle.
	 * @param active - True starts the watch. False stops it.
	 */
	function watchRuntime(active: boolean): void {
		if (!active) {
			runtimeWatch += 1;
			if (runtimeTimer !== undefined) clearInterval(runtimeTimer);
			runtimeTimer = undefined;
			console.debug("Console runtime watch", { event: "runtime-stop" });
			return;
		}
		if (runtimeTimer !== undefined || port.runtime === undefined) return;
		runtimeWatch += 1;
		const token = runtimeWatch;
		runtimeTimer = setInterval(() => {
			void refreshRuntime(token);
		}, RUNTIME_MS);
		console.debug("Console runtime watch", {
			event: "runtime-start",
			waitMs: RUNTIME_MS,
		});
		void refreshRuntime(token);
	}
	// #endregion FUNC_watchRuntime

	// #region FUNC_find
	/**
	 * @purpose Run the current search filters and keep the hits.
	 * @invariants An answer of an older generation writes no hit.
	 */
	async function find(step: Step): Promise<void> {
		const token = get().generation;
		const found = await port.search({
			profile: get().profile,
			query: get().query,
			scopes: get().searchScope ?? "",
			kinds: get().kinds.join(","),
			since: get().since,
			until: get().until,
			due: get().due ? "1" : "",
			limit: get().limit,
		});
		if (token !== get().generation) return;
		set({ hits: found });
		console.debug("Console search", {
			event: "search",
			hits: found.length,
			scope: get().searchScope ?? "",
			query: get().query,
		});
		enter(step);
	}
	// #endregion FUNC_find

	// #region FUNC_openTarget
	/**
	 * @purpose Expand a range or inspect a note, and keep the selection for the inspector.
	 * @invariants Write the address only after the host answers. An answer of a view load or of a
	 *   newer open writes no selection, so the latest click wins.
	 */
	async function openTarget(
		target: string,
		step: Step = "push",
	): Promise<void> {
		const token = get().generation;
		const seq = ++openSeq;
		const result = await port.open({
			profile: get().profile,
			scope: get().scope,
			target,
		});
		if (token !== get().generation || seq !== openSeq) return;
		console.debug("Console target opened", {
			event: "open",
			target,
			kind: result.kind,
			step,
		});
		set({ selection: { target, result } });
		enter(step);
	}
	// #endregion FUNC_openTarget

	// #region FUNC_openCatalog
	/**
	 * @purpose Expand one catalog range into the two lines below it, and keep the selection.
	 * @invariants Write the address only after the host answers. An answer of a view load or of a
	 *   newer open writes no selection, so the latest click wins.
	 */
	async function openCatalog(range: Range, step: Step = "push"): Promise<void> {
		const token = get().generation;
		const seq = ++openSeq;
		const children = await port.catalog({
			profile: get().profile,
			scope: get().scope,
			start: range.start,
			level: range.level,
		});
		if (token !== get().generation || seq !== openSeq) return;
		console.debug("Console catalog opened", {
			event: "catalog",
			start: range.start,
			level: range.level,
			lines: children.length,
		});
		set({
			selection: {
				target: renderRange(null, range),
				result: { kind: "catalog", children },
			},
		});
		enter(step);
	}
	// #endregion FUNC_openCatalog

	// #region FUNC_reset
	/**
	 * @purpose Move the console to one scope with no selection and no job.
	 */
	async function reset(nextScope: string, step: Step = "push"): Promise<void> {
		set({
			scope: nextScope,
			selection: undefined,
			hits: [],
			searchScope: null,
			job: undefined,
			jobError: "",
		});
		await loadView(step);
	}
	// #endregion FUNC_reset

	// #region FUNC_restore
	/**
	 * @purpose Move the console to the place of one route.
	 * @invariants Load the view first. Then run the search and the open of the route. Then write the
	 * resolved place as one replacement.
	 * @invariants A newer generation stops the restore, so a replaced place runs no later step.
	 * @invariants A place that the host rejects falls back to the first place once, so a removed
	 * profile cannot leave a blank page.
	 */
	async function restore(route: Route, retry = true): Promise<void> {
		const { target, ...fields } = route;
		set({
			...fields,
			selection: undefined,
			hits: [],
			job: undefined,
			jobError: "",
		});
		console.debug("Console restore", {
			event: "restore",
			screen: route.screen,
			profile: route.profile,
			scope: route.scope,
			target,
			query: route.query,
		});
		let loaded: boolean;
		try {
			loaded = await loadView("none");
		} catch (error) {
			if (!retry) throw error;
			console.debug("Console place rejected", {
				event: "fallback",
				error: String(error),
			});
			await restore(DEFAULT_ROUTE, false);
			return;
		}
		if (!loaded) return;
		const token = get().generation;
		// A search screen or a place with a search filter runs its search again.
		const state = get();
		if (
			state.screen === "search" ||
			state.query.length > 0 ||
			state.kinds.length > 0 ||
			state.since.length > 0 ||
			state.until.length > 0 ||
			state.due
		)
			await find("none");
		if (token !== get().generation) return;
		if (target && route.screen === "catalog") {
			const range = readRange(target);
			if (range) await openCatalog(range, "none");
			else
				console.debug("Console range rejected", {
					event: "range",
					target,
				});
		} else if (target) await openTarget(target, "none");
		if (token !== get().generation) return;
		enter("replace");
	}
	// #endregion FUNC_restore

	// #region FUNC_runAction
	/**
	 * @purpose Apply one user action once and refresh its visible result.
	 * @invariants A second action waits until the first one finishes.
	 * @invariants A save closes the dialog, clears the selection, and reloads the view.
	 */
	async function runAction(
		name: string,
		extra: ActionFields = {},
	): Promise<unknown> {
		if (get().busy) throw new Error(t("busyAction"));
		set({ busy: true });
		message(t("saving"));
		try {
			console.debug("Console action", {
				event: "action",
				action: name,
				profile: get().profile,
				scope: get().scope,
			});
			const result = await port.action(name, {
				profile: get().profile,
				scope: get().scope,
				...extra,
			});
			set({ dialog: null, selection: undefined });
			await loadView();
			message(t("saved"));
			return result;
		} finally {
			set({ busy: false });
		}
	}
	// #endregion FUNC_runAction

	// #region FUNC_dialogOf
	/**
	 * @purpose Build the record dialog of one record, or of a new note.
	 * @invariants An amendment keeps the record. A supersede writes a new record with a link.
	 * @invariants The kind is the note kind of the open entry.
	 * @invariants The amendment form shows the supersede links of the record and starts the field
	 * empty.
	 *   A save adds the links of the field that the record lacks. It removes no link.
	 */
	function dialogOf(
		record: ConsoleEntry | undefined,
		supersedes: string,
	): DialogState {
		const amend = record !== undefined && supersedes === "";
		return {
			mode: amend ? "amend" : supersedes ? "supersede" : "create",
			target: record === undefined ? "" : `${record.scope}#${record.pos}`,
			body: record?.body ?? "",
			longform: record?.longform ?? "",
			scope: record?.scope ?? get().scope,
			kind: record?.noteKind ?? "note",
			supersedes: amend ? "" : supersedes,
			links: amend ? record.supersedes : [],
		};
	}
	// #endregion FUNC_dialogOf

	// #region FUNC_saveDialog
	/**
	 * @purpose Send one note or amendment to the host.
	 * @invariants An amendment names the record and the destination scope. A new note names the scope
	 * of the form.
	 */
	async function saveDialog(payload: DialogPayload): Promise<void> {
		const dialog = get().dialog;
		if (!dialog) return;
		const fields: Record<string, unknown> = {
			body: payload.body,
			longform: payload.longform,
			kind: payload.kind,
			supersedes: payload.supersedes,
		};
		if (dialog.mode === "amend") {
			fields.target = dialog.target;
			fields.dest = payload.scope;
			await runAction("amend", fields);
			return;
		}
		fields.scope = payload.scope;
		await runAction("note", fields);
	}
	// #endregion FUNC_saveDialog

	// #region FUNC_prepareCompaction
	/**
	 * @purpose Prepare one compaction job and keep it for the answer form.
	 * @invariants A job without a merge input stays in the state with no error.
	 */
	async function prepareCompaction(): Promise<void> {
		const result = (await runAction("compact", {})) as {
			inputs: BuildInput[];
			job: string;
		} | null;
		if (!result || !Array.isArray(result.inputs)) throw new Error(t("badJob"));
		set({
			job: {
				inputs: result.inputs,
				job: result.job,
				profile: get().profile,
				scope: get().scope,
			},
			jobError: "",
		});
	}
	// #endregion FUNC_prepareCompaction

	// #region FUNC_applyCompaction
	/**
	 * @purpose Apply the answers of one job and state the result of each range.
	 * @invariants An answer that names no range of the job fails before the host call.
	 * @invariants A rejected answer keeps the job and states each rejected range.
	 */
	async function applyCompaction(answers: string): Promise<void> {
		const job = get().job;
		if (!job) return;
		const wanted = job.inputs.map((input) => renderRange(null, input.range));
		try {
			if (!answers.trim()) throw new Error(t("enterAnswers"));
			const unknown = unknownInputs(answers, wanted);
			if (unknown.length)
				throw new Error(t("unknownInput", { inputs: wanted.join(", ") }));
			const result = (await runAction("compact-answer", {
				inputs: job.inputs,
				answers,
			})) as {
				built: number;
				rejected: number;
				rejectedRanges?: string[];
			};
			const failed = result.rejected > 0;
			const text = failed
				? t("rejectedRanges", {
						ranges: (result.rejectedRanges ?? []).join(", "),
					})
				: "";
			set({ job: failed ? job : undefined, jobError: text });
			message(
				failed
					? text
					: t("built", { built: result.built, rejected: result.rejected }),
				failed,
			);
		} catch (error) {
			const text = error instanceof Error ? error.message : String(error);
			set({ jobError: text });
			message(text, true);
		}
	}
	// #endregion FUNC_applyCompaction

	// #region FUNC_editNote
	/**
	 * @purpose Open the record dialog for one record, and read the record for its fields.
	 * @invariants The read record must be a note. A range gives the select message.
	 * @invariants An answer of an older generation opens no dialog.
	 */
	async function editNote(target: string, supersede: boolean): Promise<void> {
		const token = get().generation;
		const seq = ++openSeq;
		const result = await port.open({
			profile: get().profile,
			scope: get().scope,
			target,
		});
		if (token !== get().generation || seq !== openSeq) return;
		if (result.kind !== "entry") throw new Error(t("selectLine"));
		set({ dialog: dialogOf(result, supersede ? target : "") });
	}
	// #endregion FUNC_editNote

	// #region FUNC_chooseLanguage
	/**
	 * @purpose Put one language on the page and keep the choice for the next visit.
	 * @invariants An unknown code gives English.
	 */
	function chooseLanguage(code: string): void {
		const lang = languageOf(code);
		set({ lang });
		storage.write(LANG_KEY, lang);
	}
	// #endregion FUNC_chooseLanguage

	// #region FUNC_chooseTheme
	/**
	 * @purpose Put one theme choice on the page and keep the choice for the next visit.
	 * @invariants An unknown code gives the system setting. The shell applies the theme to the page.
	 */
	function chooseTheme(code: string): void {
		const theme = themeOf(code);
		set({ theme });
		storage.write(THEME_KEY, theme);
	}
	// #endregion FUNC_chooseTheme

	return {
		navigate(screen: Screen) {
			return guard(async () => {
				if (screen !== get().screen) set({ screen, selection: undefined });
				await loadView("push");
			});
		},
		restore(route: Route) {
			return guard(() => restore(route, true));
		},
		openTarget(target: string) {
			return guard(() => openTarget(target, "push"));
		},
		openInTree(target: string) {
			return guard(async () => {
				const token = get().generation;
				await openTarget(target, "none");
				if (token !== get().generation) return;
				set({ screen: "tree" });
				await loadView("push");
			});
		},
		openCatalog(range: Range) {
			return guard(() => openCatalog(range, "push"));
		},
		openScopeTree(key: string) {
			return guard(async () => {
				set({ screen: "tree" });
				await reset(key);
			});
		},
		search(filters: SearchFilters) {
			return guard(async () => {
				set({
					query: filters.query.trim(),
					kinds: filters.kinds,
					since: filters.since,
					until: filters.until,
					due: filters.due,
					limit: filters.limit,
					searchScope: filters.searchScope,
				});
				await find("push");
			});
		},
		reload(reviewKind?: NoteKind | "") {
			return guard(async () => {
				if (reviewKind !== undefined) set({ reviewKind });
				await loadView("push");
			});
		},
		refresh() {
			return guard(async () => {
				const read = port.runtime;
				if (read === undefined) return;
				const runtime = await read().catch(() => undefined);
				if (runtime?.store?.ready !== true) return;
				set({ runtime });
				await loadView("none");
			});
		},
		reset(scope: string) {
			return guard(() => reset(scope, "push"));
		},
		setProfile(profile: string) {
			return guard(async () => {
				set({ profile });
				await reset("", "push");
			});
		},
		async action(name: string, extra: ActionFields = {}) {
			try {
				return await runAction(name, extra);
			} catch (error) {
				report(error);
				return undefined;
			}
		},
		newNote() {
			set({ dialog: dialogOf(undefined, "") });
		},
		editNote(target: string, supersede: boolean) {
			return guard(() => editNote(target, supersede));
		},
		closeDialog() {
			set({ dialog: null });
		},
		saveDialog(payload: DialogPayload) {
			return guard(() => saveDialog(payload));
		},
		prepareCompaction() {
			return guard(() => prepareCompaction());
		},
		applyCompaction(answers: string) {
			return guard(() => applyCompaction(answers));
		},
		setLanguage(code: string) {
			try {
				chooseLanguage(code);
			} catch (error) {
				report(error);
			}
		},
		setTheme(choice: string) {
			try {
				chooseTheme(choice);
			} catch (error) {
				report(error);
			}
		},
		clearStatus() {
			message("");
		},
		watchRuntime(active: boolean) {
			try {
				watchRuntime(active);
			} catch (error) {
				report(error);
			}
		},
		copy(text: string) {
			void (async () => {
				try {
					await (options.clipboard ?? pageClipboard())(text);
					message(t("copied"));
				} catch (error) {
					report(error);
				}
			})();
		},
	};
}
// #endregion FUNC_createConsoleController

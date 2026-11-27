/**
 * #region moduleContract
 * @purpose Define the contract of the host-neutral console layer, so two shells share one model
 * with no DOM, no transport, and no address.
 * @scope The page state, the store port, the storage, the API, the actions, the dialog, and the
 * host runtime state. NOT: the behaviour, the transport, the markup, and the styles.
 * @invariants This module holds types and interfaces only. It holds no implementation.
 * @keywords console, model, contract, state, port, action, dialog, runtime
 * #endregion moduleContract
 */

import type {
	ConsoleChildren,
	ConsoleEntry,
	ConsoleScreen,
	IndexHit,
	NoteKind,
	Range,
	SliceLine,
} from "@memlens/core";
import type { Lang, Table } from "../i18n.js";
import type { Route, Screen } from "../route.js";
import type { Choice, Job, Selection, View } from "../types.js";

// #region TYPE_Translate
/**
 * @purpose Give the message of one key in the current language.
 * @invariants The function fills each placeholder from the values. An absent value writes no text.
 */
export type Translate = (
	key: keyof Table,
	values?: Record<string, string | number>,
) => string;
// #endregion TYPE_Translate

// #region INTERFACE_StatusLine
/**
 * @purpose Hold the one status text of the page and its error flag.
 * @invariants The text goes into a text node. An empty text shows no status.
 * @invariants The shell shows the status line in the open dialog when a dialog is open.
 */
export interface StatusLine {
	readonly text: string;
	readonly error: boolean;
}
// #endregion INTERFACE_StatusLine

// #region TYPE_DialogMode
/**
 * @purpose Name the three forms of the record dialog.
 * @invariants An amendment changes one record. A supersede writes a new record with a link.
 */
export type DialogMode = "create" | "amend" | "supersede";
// #endregion TYPE_DialogMode

// #region INTERFACE_DialogPayload
/**
 * @purpose Hold the values that a human types in the record dialog.
 * @invariants The scope is the destination scope of the note.
 */
export interface DialogPayload {
	readonly body: string;
	readonly longform: string;
	readonly scope: string;
	readonly kind: NoteKind | "";
	readonly supersedes: string;
}
// #endregion INTERFACE_DialogPayload

// #region INTERFACE_DialogState
/**
 * @purpose Hold the open record dialog with its form values.
 * @invariants The target is the address of the amended record. It is empty for a new note.
 * @invariants The links are the supersede links of the amended record. The field holds the targets
 *   that the save adds, so a cleared field adds nothing.
 * @invariants The kind is the note kind of the opened record. A new note starts as a note.
 */
export interface DialogState extends DialogPayload {
	readonly mode: DialogMode;
	readonly target: string;

	/** The supersede links that the record holds. The form shows them and adds no removal. */
	readonly links: readonly string[];
}
// #endregion INTERFACE_DialogState

// #region INTERFACE_ConsoleState
/**
 * @purpose Hold the page state of one console, so a shell draws the page from one object.
 * @invariants The state holds the status line and the open dialog. The DOM console kept them
 * outside the state object.
 * @invariants A new visit starts on the overview with no selection and no job.
 * @keywords state, model, screen, selection, search, job, status, dialog
 */
export interface ConsoleState {
	readonly model: View | undefined;
	readonly profile: string;
	readonly scope: string;
	readonly screen: Screen;
	readonly lang: Lang;
	readonly theme: Choice;
	readonly busy: boolean;
	readonly generation: number;
	readonly selection: Selection | undefined;
	readonly hits: readonly IndexHit[];
	readonly query: string;

	/** The kinds of the search. An empty list takes each kind. */
	readonly kinds: readonly NoteKind[];
	readonly since: string;
	readonly until: string;

	/** True when the search keeps only the notes that are due for review. */
	readonly due: boolean;
	readonly limit: string;
	readonly searchScope: string | null;
	readonly reviewKind: NoteKind | "";
	readonly job: Job | undefined;
	readonly jobError: string;
	readonly status: StatusLine;
	readonly dialog: DialogState | null;

	/**
	 * The text of the last failed view read. An empty or absent text shows no failure, and the
	 * shell states the loading of the screen. The shell offers a retry of that read.
	 */
	readonly loadError?: string;

	/** The host runtime state, when its port gives one. The standalone host gives none. */
	readonly runtime?: ConsoleRuntime;
}
// #endregion INTERFACE_ConsoleState

// #region INTERFACE_ViewQuery
/**
 * @purpose Hold the fields of one view read.
 * @invariants The screen names the screen payload of the answer, so the host reads one screen only.
 *   An absent screen reads the overview.
 */
export interface ViewQuery {
	readonly profile: string;
	readonly scope: string;
	readonly kind: NoteKind | "";
	readonly screen?: ConsoleScreen;
}
// #endregion INTERFACE_ViewQuery

// #region INTERFACE_SearchQuery
/**
 * @purpose Hold the fields of one search, so each transport sends the fields of one find filter.
 * @invariants Each list is one text, and a comma separates its values.
 * @invariants An empty `scopes` reads every visible scope. An empty text imposes no limit.
 */
export interface SearchQuery {
	readonly profile: string;
	readonly query: string;
	readonly scopes: string;
	readonly kinds: string;
	readonly since: string;
	readonly until: string;

	/** The text `1` keeps only the notes that are due for review. An empty text keeps each note. */
	readonly due: string;
	readonly limit: string;
}
// #endregion INTERFACE_SearchQuery

// #region INTERFACE_OpenQuery
/**
 * @purpose Hold the fields of one open.
 */
export interface OpenQuery {
	readonly profile: string;
	readonly scope: string;
	readonly target: string;
}
// #endregion INTERFACE_OpenQuery

// #region INTERFACE_CatalogQuery
/**
 * @purpose Hold the fields of one catalog read.
 */
export interface CatalogQuery {
	readonly profile: string;
	readonly scope: string;
	readonly start: number;
	readonly level: number;
}
// #endregion INTERFACE_CatalogQuery

// #region TYPE_OpenedTarget
/**
 * @purpose Hold the answer of one open: a note or the children of a range.
 * @invariants The entry holds the note kind, the state, and the links, so a surface reads them
 *   without a second read of the scope.
 */
export type OpenedTarget = ConsoleEntry | ConsoleChildren;
// #endregion TYPE_OpenedTarget

// #region TYPE_ActionFields
/**
 * @purpose Hold the fields of one host action.
 */
export type ActionFields = Readonly<Record<string, unknown>>;
// #endregion TYPE_ActionFields

// #region INTERFACE_ConsoleRuntime
/**
 * @purpose Hold the state that one host keeps outside the store.
 * @scope The session, the materialization time, the next trigger, the saved snapshot state, and the
 * compaction state. NOT: the console model.
 * @invariants The standalone host gives no runtime. The plugin host gives it.
 * @invariants The shape of this state is pending. See the UI specification.
 * @keywords runtime, session, snapshot, trigger, compaction
 */
export interface ConsoleRuntime {
	readonly session?: string;
	readonly materializedAt?: string;
	readonly snapshotSaved?: boolean;

	/** True when the host store is open. A surface states the error of a store that is not open. */
	readonly store?: {
		readonly ready: boolean;
		readonly error: string | null;
	};
	readonly compaction?: {
		readonly attempts: number;
		readonly active: number;
		readonly backoffMs: number;
		readonly failures: number;
		readonly dirty: number;
		readonly provider: string;
		readonly model: string;
		readonly lastRunAt: string | null;
		readonly nextRunAt: string | null;
		readonly lastError: string | null;
		readonly events: readonly {
			readonly at: string;

			/** The class of the event. A `call` states one model call of a pass. */
			readonly kind: "pass" | "retry" | "error" | "call";
			readonly text: string;
		}[];
	};
}
// #endregion INTERFACE_ConsoleRuntime

// #region INTERFACE_StorePort
/**
 * @purpose Give the console one transport to the store, so each shell supplies its own backend.
 * @invariants The port holds no address. The shell supplies its transport.
 * @invariants The port gives the shapes of the CLI routes view, search, open, catalog, and action.
 * @usecases
 *  - View: controller => asks for one scope => gets the console model
 * @keywords port, transport, view, search, open, catalog, action, runtime
 */
export interface StorePort {
	view(query: ViewQuery): Promise<View>;
	search(query: SearchQuery): Promise<readonly IndexHit[]>;
	open(query: OpenQuery): Promise<OpenedTarget>;
	catalog(query: CatalogQuery): Promise<readonly SliceLine[]>;
	action(name: string, fields: ActionFields): Promise<unknown>;
	runtime?(): Promise<ConsoleRuntime>;
}
// #endregion INTERFACE_StorePort

// #region INTERFACE_ConsoleStorage
/**
 * @purpose Keep the language and theme choice between visits.
 * @invariants A blocked storage keeps the choice for this page only.
 * @keywords storage, language, theme, choice
 */
export interface ConsoleStorage {
	read(key: string, fallback: string): string;
	write(key: string, value: string): void;
}
// #endregion INTERFACE_ConsoleStorage

// #region INTERFACE_SearchFilters
/**
 * @purpose Hold the search filters of the search screen.
 * @invariants A null search scope follows the selected scope. An empty scope reads every visible
 * scope.
 */
export interface SearchFilters {
	readonly query: string;
	readonly kinds: readonly NoteKind[];
	readonly since: string;
	readonly until: string;
	readonly due: boolean;
	readonly limit: string;
	readonly searchScope: string | null;
}
// #endregion INTERFACE_SearchFilters

// #region INTERFACE_ConsoleActions
/**
 * @purpose Give one callback for each user intent of the console, so a shell binds a control to the
 * model and not to the transport.
 * @invariants A callback reports its error in the status line. A callback does not reject.
 * @invariants The shell reads the address and calls restore. The controller writes the address
 * through the shell.
 * @keywords action, navigate, open, search, dialog, language, theme, compaction
 */
export interface ConsoleActions {
	navigate(screen: Screen): Promise<void>;
	restore(route: Route): Promise<void>;
	openTarget(target: string): Promise<void>;
	openInTree(target: string): Promise<void>;
	openCatalog(range: Range): Promise<void>;
	openScopeTree(key: string): Promise<void>;
	search(filters: SearchFilters): Promise<void>;
	reload(reviewKind?: NoteKind | ""): Promise<void>;

	/**
	 * Probe the host state without a status change. The call loads the view only when the store
	 * reports that it is open, so a surface replaces a stated store error with the memory.
	 */
	refresh(): Promise<void>;
	reset(scope: string): Promise<void>;
	setProfile(profile: string): Promise<void>;
	action(name: string, extra?: ActionFields): Promise<unknown>;
	newNote(): void;
	editNote(target: string, supersede: boolean): Promise<void>;
	closeDialog(): void;
	saveDialog(payload: DialogPayload): Promise<void>;
	prepareCompaction(): Promise<void>;
	applyCompaction(answers: string): Promise<void>;
	setLanguage(code: string): void;
	setTheme(choice: string): void;
	clearStatus(): void;

	/**
	 * Start or stop the live read of the host runtime state.
	 * A screen starts it on mount and stops it on cleanup.
	 */
	watchRuntime(active: boolean): void;

	/** Put one short text into the clipboard of the page and state the result. */
	copy(text: string): void;
}
// #endregion INTERFACE_ConsoleActions

// #region INTERFACE_ConsoleApi
/**
 * @purpose Give a shell the state, the subscription, the text, and the actions of one console.
 * @invariants The state is the current snapshot. The subscribe function stays the same between
 * renders, so useSyncExternalStore is stable.
 * @invariants The text function gives the message of the language in the current state.
 * @keywords api, state, subscribe, text, actions
 */
export interface ConsoleApi {
	readonly state: ConsoleState;
	subscribe(listener: () => void): () => void;
	t: Translate;
	readonly call: ConsoleActions;
}
// #endregion INTERFACE_ConsoleApi

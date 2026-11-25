/**
 * #region moduleContract
 * @purpose Hold the state shapes that the controller and the screens share, so each module reads one
 * model of the page.
 * @scope The view, the job, the selection, the opened target, the theme, and the history step.
 * NOT: the markup and the host calls.
 * @invariants The view holds the console model of one screen only. A field of another screen is
 * absent, so a shell renders no empty value.
 * @keywords state, view, job, selection, theme, step, type
 * #endregion moduleContract
 */

import type {
	BuildInput,
	ConsoleChildren,
	ConsoleEntry,
	ConsoleModel,
	NoteKind,
	Proposal,
	SliceLine,
} from "@memlens/core";

// #region TYPE_View
/**
 * @purpose Give one console read with the fields that the host adds to the core model.
 * @invariants `reviewPolicy` is present on the review read only. `proposals` is present on the
 *   proposals read only.
 * @keywords view, console, model, host, proposals, policy
 */
export type View = ConsoleModel & {
	profiles: string[];
	path: string;
	backend: string;
	allowDelete: boolean;
	reviewPolicy?: Record<NoteKind, number>;
	proposals?: readonly Proposal[];
};
// #endregion TYPE_View

// #region TYPE_Job
/**
 * @purpose Hold one prepared compaction job of the page.
 */
export type Job = {
	inputs: BuildInput[];
	job: string;
	profile: string;
	scope: string;
};
// #endregion TYPE_Job

// #region TYPE_Selection
/**
 * @purpose Hold the open target of the page and its answer.
 * @invariants A console open answers a note entry or the children of a range.
 */
export type Selection = { target: string; result: Opened };
// #endregion TYPE_Selection

/** The answer of one open: a note, the children of a range, or the lines below a catalog range. */
type Opened =
	| ConsoleEntry
	| ConsoleChildren
	| { readonly kind: "catalog"; readonly children: readonly SliceLine[] };

/** One theme choice of the page. */
export type Choice = "system" | "light" | "dark";

/** How a state change meets the browser history: a new entry, the current entry, or no write. */
export type Step = "push" | "replace" | "none";

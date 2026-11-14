/**
 * #region moduleContract
 * @purpose Hold the state shapes that the controller and the screens share, so each module reads one
 * model of the page.
 * @scope The view, the job, the record row, the selection, the opened target, the theme, and the
 * history step. NOT: the markup and the host calls.
 * @dependencies USES TYPE: the console model, the open reads, the store types, and the tree types.
 * @keywords state, view, job, selection, theme, step, type
 * #endregion moduleContract
 */

import type { ConsoleModel } from "../../core/src/domain/console.js";
import type { OpenChildren, OpenEntry } from "../../core/src/domain/reads.js";
import type { Proposal } from "../../core/src/store/types.js";
import type { NoteKind } from "../../core/src/types/primitives.js";
import type { BuildInput, SliceLine } from "../../core/src/types/tree.js";

/** The view of one profile at one scope, as the host gives it. */
export type View = ConsoleModel & {
	profiles: string[];
	path: string;
	backend: string;
	allowDelete: boolean;
	reviewPolicy: Record<NoteKind, number>;
	proposals: readonly Proposal[];
};

/** One prepared compaction job of the page. */
export type Job = {
	inputs: BuildInput[];
	job: string;
	profile: string;
	scope: string;
};

/** One record row of the view. */
export type RecordModel = ConsoleModel["records"][number];

/** The open target of the page and its answer. */
export type Selection = { target: string; result: Opened };

/** The answer of one open: a note, the children of a range, or the lines below a catalog range. */
type Opened =
	| OpenEntry
	| OpenChildren
	| { readonly kind: "catalog"; readonly children: readonly SliceLine[] };

/** One theme choice of the page. */
export type Choice = "system" | "light" | "dark";

/** How a state change meets the browser history: a new entry, the current entry, or no write. */
export type Step = "push" | "replace" | "none";

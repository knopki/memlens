/**
 * #region moduleContract
 * @purpose Map each screen name to its builder, so the chrome draws the current screen without a
 * switch in each file.
 * @scope The seven screen builders. NOT: the chrome and the state.
 * @keywords screens, index, registry, view
 * #endregion moduleContract
 */

import type { Screen } from "../route.js";
import type { View } from "../types.js";
import { catalog } from "./catalog.js";
import { maintenance } from "./maintenance.js";
import { overview } from "./overview.js";
import { proposals } from "./proposals.js";
import { review } from "./review.js";
import { search } from "./search.js";
import { tree } from "./tree.js";

// #region CONST_SCREEN_VIEWS
/**
 * @purpose Give the builder of each console screen.
 */
export const SCREEN_VIEWS: Record<
	Screen,
	(main: HTMLElement, model: View) => void
> = {
	overview,
	tree,
	catalog,
	search,
	review,
	proposals,
	maintenance,
};
// #endregion CONST_SCREEN_VIEWS

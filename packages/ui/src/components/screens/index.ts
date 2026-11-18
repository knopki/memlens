/**
 * #region moduleContract
 * @purpose Give both console shells one screen registry, so a shell draws the screen of the route
 *   name and holds no per-screen switch.
 * @scope The seven screen components and their common prop type.
 *   NOT: the screens, the shell, the transport, and the styles.
 * @invariants Each screen takes one `ScreenProps` and reads the state and the actions from its API.
 * @invariants The registry holds one entry for each name of `SCREENS`.
 * @keywords screens, registry, component, shell, route
 * #endregion moduleContract
 */

import type { ComponentType } from "react";
import type { Screen } from "../../route.js";
import type { ScreenProps } from "../screen-props.js";
import { Catalog } from "./catalog.js";
import { Maintenance } from "./maintenance.js";
import { Overview } from "./overview.js";
import { Proposals } from "./proposals.js";
import { Review } from "./review.js";
import { Search } from "./search.js";
import { TreeView } from "./tree.js";

// #region CONST_SCREEN_COMPONENTS
/**
 * @purpose Give the component of each console screen, so a shell draws the current screen from its
 *   name.
 * @invariants The keys are the seven names of `SCREENS`. A missing name fails the type check.
 */
export const SCREEN_COMPONENTS: Record<Screen, ComponentType<ScreenProps>> = {
	overview: Overview,
	tree: TreeView,
	catalog: Catalog,
	search: Search,
	review: Review,
	proposals: Proposals,
	maintenance: Maintenance,
};
// #endregion CONST_SCREEN_COMPONENTS

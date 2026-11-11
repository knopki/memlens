/**
 * #region moduleContract
 * @purpose Supply shared console models through the store port for each host.
 * @scope Scope panels, context, trees, catalog, build candidates, and due records.
 * @invariants Read projection state only through StorePort. Open no file. Import no DOM, transport, or style.
 * @invariants Exclude scopes outside the profile. Return JSON values from one stable projection revision.
 * @invariants The frontier holds the slice lines of the selected scope, in the same order and with
 * the same fold as the text of the slice. A range line hides the notes inside that range.
 * #endregion moduleContract
 */

import { debuglog } from "node:util";
import { MemlensError } from "../types/errors.js";
import type { ScopeKey } from "../types/events.js";
import type { Projection, ProjectionRecord } from "../types/projection.js";
import type { StorePort } from "../types/store.js";
import type { Range, SliceLine, TreeNode } from "../types/tree.js";
import { visibleScopes } from "./active-scope.js";
import type { ResolvedConfig } from "./config.js";
import { directionLines, hereLines, renderContext } from "./context.js";
import { catalogTree, scopeTree } from "./projection.js";
import { type DueRecord, dueRecords } from "./reads.js";
import { catalogKey, validateScopeKey } from "./scope.js";
import { nowIso } from "./time.js";
import { buildInput, candidates, isClean, slice } from "./tree.js";

const debug = debuglog("memlens:console");

// #region CLASS_ConsoleModel
/** @purpose Give console hosts one serializable view of the visible memory. */
export interface ConsoleModel {
	readonly profile: string;
	readonly scope: ScopeKey;
	readonly scopes: readonly {
		readonly key: ScopeKey;
		readonly total: number;
		readonly live: number;
		readonly hidden: number;
		readonly deleted: number;
		readonly frontier: string;
	}[];
	readonly here: string;
	readonly directions: string;
	readonly text: string;
	readonly budgets: {
		readonly here: { readonly used: number; readonly limit: number };
		readonly directions: { readonly used: number; readonly limit: number };
	};
	readonly records: readonly ProjectionRecord[];
	readonly nodes: readonly {
		readonly scope: string;
		readonly node: TreeNode;
		readonly clean: boolean;
	}[];
	readonly candidates: readonly {
		readonly scope: string;
		readonly range: Range;
		readonly ready: boolean;
	}[];
	readonly catalog: readonly SliceLine[];
	readonly frontier: readonly SliceLine[];
	readonly review: readonly DueRecord[];
	readonly revision: string;
}
// #endregion CLASS_ConsoleModel

// #region FUNC_readConsole
/**
 * @purpose Read one console snapshot for the selected visible scope.
 * @invariants Keep explicit empty scopes. Accept an absent selected scope when the profile matches it.
 * @invariants Use the resolved profile name and independent line budgets. Read no event export and call no writer.
 */
export async function readConsole(
	store: StorePort,
	config: ResolvedConfig,
	scope: ScopeKey,
	now?: string,
): Promise<ConsoleModel> {
	debug("Console read start", { event: "start", scope });
	let revision: string;
	let projection: Projection;
	do {
		revision = await store.rev();
		projection = await store.projection();
	} while (revision !== (await store.rev()));
	const keys = visibleScopes(config.profile.scopes, [
		...new Set([
			...projection.scopeOrder,
			...config.profile.scopes.filter(validateScopeKey),
			scope,
		]),
	]);
	if (!validateScopeKey(scope) || !keys.includes(scope)) {
		throw new MemlensError("NotAllowed", `Scope is not visible: ${scope}`);
	}
	const time = now ?? nowIso();
	const profile = config.defaultProfile;
	const trees = keys.map((key) => ({
		scope: key,
		tree: scopeTree(projection, key),
	}));
	const hereTree = scopeTree(projection, scope);
	const catalog = catalogTree(projection, profile, keys);
	const catalogScopes = projection.scopeOrder
		.filter((key) => keys.includes(key))
		.map((key) => {
			const live = (projection.byScope.get(key) ?? []).filter(
				(record) => record.state === "live",
			);
			return {
				key,
				live: live.length,
				lastWrite:
					live
						.map((record) => record.recorded_at)
						.sort()
						.at(-1) ?? "",
			};
		});
	const scopes = trees.map(({ scope: key, tree }) => ({
		key,
		total: tree.total,
		live: tree.notes.filter((note) => note.state === "live").length,
		hidden: tree.notes.filter((note) => note.state === "hidden").length,
		deleted: tree.notes.filter((note) => note.state === "deleted").length,
		frontier: hereLines(tree, config.budget.here),
	}));
	const allTrees = [...trees, { scope: catalogKey(profile), tree: catalog }];
	const model: ConsoleModel = {
		profile,
		scope,
		scopes,
		here: hereLines(hereTree, config.budget.here),
		directions: directionLines(
			catalog,
			catalogScopes,
			scope,
			config.budget.directions,
			time,
		),
		text: renderContext({
			scope,
			here: hereTree,
			hereBudget: config.budget.here,
			catalog,
			catalogScopes,
			directionsBudget: config.budget.directions,
			now: time,
			...(config.customPrompt === null
				? {}
				: { customPrompt: config.customPrompt }),
			...(config.customPromptAppend === null
				? {}
				: { customPromptAppend: config.customPromptAppend }),
		}),
		budgets: {
			here: {
				used: slice(hereTree, config.budget.here).length,
				limit: config.budget.here,
			},
			directions: {
				used: slice(catalog, config.budget.directions).length,
				limit: config.budget.directions,
			},
		},
		records: keys.flatMap((key) => [...(projection.byScope.get(key) ?? [])]),
		nodes: allTrees.flatMap(({ scope: key, tree }) =>
			tree.nodes.map((node) => ({
				scope: key,
				node,
				clean: isClean(tree, node),
			})),
		),
		candidates: allTrees.flatMap(({ scope: key, tree }) =>
			candidates(tree).map((range) => ({
				scope: key,
				range,
				ready: buildInput(tree, range) !== null,
			})),
		),
		catalog: slice(catalog, config.budget.directions),
		frontier: slice(hereTree, config.budget.here),
		review: dueRecords(projection, keys, time.slice(0, 10)),
		revision,
	};
	debug("Console read", {
		profile,
		scope,
		scopes: scopes.length,
		records: model.records.length,
		nodes: model.nodes.length,
		frontier: model.frontier.length,
	});
	return model;
}
// #endregion FUNC_readConsole

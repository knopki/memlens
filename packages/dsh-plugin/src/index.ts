/**
 * #region moduleContract
 * @purpose Start shared memory storage and validate memory settings before an agent starts.
 * @scope The host entry, patch schema, service registration, and minimum model context.
 * @invariants The host owns one store. The preset entry supplies only scoped configuration.
 * @invariants This stage registers no memory context, tool, timer, or background model call.
 * @dependencies @deepseek-ai/cordis, @deepseek-ai/dsh-agent, @deepseek-ai/dsh-llm, @memlens/core.
 * @keywords dsh, plugin, memlens, configuration, model, registration
 * #endregion moduleContract
 */

import type { Context } from "@deepseek-ai/cordis";
import type { Agent, ModelSelection } from "@deepseek-ai/dsh-agent";
import { isAgentLoopRequest } from "@deepseek-ai/dsh-llm";
import type {} from "@deepseek-ai/dsh-workspace";
import { MemlensError, type PatchConfig } from "@memlens/core";
import { PatchConfigSchema } from "./config.js";
import { Memlens } from "./service.js";

/** The settings schema of the host plugin. */
export const Config = PatchConfigSchema;
export { type AgentMemory, Memlens } from "./service.js";

export type Config = PatchConfig;

/** The diagnostic plugin name. The bundle row id is memlens. */
export const name = "dsh-memlens";

/** The LLM service supplies model metadata without a model call. */
export const inject = ["llm"];

/** The accepted minimum model context, in tokens. */
const MINIMUM_CONTEXT = 65_536;

// #region FUNC_checkAgentModel
/**
 * @purpose Reject a session whose model cannot hold the memory and the required context reserve.
 * @param ctx - The host context with its declared LLM dependency.
 * @param selection - The exact route of the session or admitted step.
 * @param signal - The cancellation signal, when present.
 * @returns Completion after the exact model metadata meets the context requirement.
 */
async function checkAgentModel(
	ctx: Context,
	selection: ModelSelection,
	signal?: AbortSignal,
): Promise<void> {
	const model = await ctx.llm.resolveModelInfo(
		selection.provider,
		selection.model,
		signal,
	);
	const capacity = model.context?.contextWindow;
	if (capacity === undefined) {
		throw new MemlensError(
			"Data",
			`The context size of ${selection.provider}/${selection.model} is absent.`,
		);
	}
	if (capacity < MINIMUM_CONTEXT) {
		throw new MemlensError(
			"Data",
			`Memlens needs at least ${MINIMUM_CONTEXT} context tokens; ${selection.provider}/${selection.model} has ${capacity}.`,
		);
	}
}
// #endregion FUNC_checkAgentModel

// #region FUNC_apply
/**
 * @purpose Register the shared store and resolve memory settings before agent creation completes.
 * @param ctx - The host plugin context.
 * @param config - The validated patch layer.
 */
export function apply(ctx: Context, config: Config = {}): void {
	const memlens = new Memlens(ctx, config);
	const checked = new WeakMap<Agent, string>();
	const disabled = (agent: Agent) =>
		agent.session.header.origin === "subagent" &&
		memlens.configFor(agent).profile.subagents === "off";

	// #region FUNC_validate
	/** @purpose Check each selected route once for each agent before its model stream starts. */
	const validate = async (
		agent: Agent,
		selection: ModelSelection,
		signal?: AbortSignal,
	) => {
		if (disabled(agent)) return;
		const route = JSON.stringify([selection.provider, selection.model]);
		if (checked.get(agent) === route) return;
		await checkAgentModel(ctx, selection, signal);
		checked.set(agent, route);
	};
	// #endregion FUNC_validate

	ctx.on("agent/created", async ({ agent, signal }) => {
		if (disabled(agent)) return undefined;
		const cwd = agent.session.header.cwd;
		const workspace = cwd
			? await ctx
					.get("workspaceRegistry")
					?.resolveByPath(cwd)
					.catch(() => undefined)
			: undefined;
		memlens.forAgent(agent, workspace?.id);
		const selection = agent.model.current();
		if (selection) await validate(agent, selection, signal);
		return undefined;
	});
	ctx.on("llm/stream", async function* (options, next) {
		if (isAgentLoopRequest(options) && options.sessionId !== undefined) {
			const agent = ctx.get("agents")?.get(options.sessionId);
			if (agent) await validate(agent, options, options.signal);
		}
		yield* next();
	});
}
// #endregion FUNC_apply

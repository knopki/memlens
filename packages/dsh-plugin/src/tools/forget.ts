/**
 * Each target echo names the action as hidden or proposed.
 *
 * #region moduleContract
 * @purpose Hide each target of the profile, or store one hide proposal for an invisible scope.
 * @scope The memory_forget schema, the target read, the hide, and the hide proposal.
 *  NOT: the row rules and the console decision.
 * @dependencies USES API: @memlens/core, @deepseek-ai/dsh-tools
 * @keywords memlens, tool, forget, hide, proposal, scope
 * #endregion moduleContract
 */

import type { Agent } from "@deepseek-ai/dsh-agent";
import { defineTool, type ToolDefinition } from "@deepseek-ai/dsh-tools";
import { hide, normalizeScopeKey, propose, type ScopeKey } from "@memlens/core";
import type { AgentMemory } from "../service.js";
import {
	blocks,
	debug,
	ECHO_FIELDS,
	listedInProfile,
	type MemoryForgetInput,
	type MemoryForgetOutput,
	noteEcho,
	renderEcho,
	resolveTarget,
} from "./shared.js";

// #region FUNC_forgetAnswer
/**
 * @purpose Hide each target of the profile, or propose one hide for an invisible scope.
 */
function forgetAnswer(
	agent: Agent,
	memory: AgentMemory,
	input: MemoryForgetInput,
): MemoryForgetOutput {
	const fallback =
		input.scope === undefined
			? memory.scope
			: (normalizeScopeKey(input.scope) as ScopeKey);
	const records: MemoryForgetOutput["records"] = [];
	for (const target of input.targets) {
		const resolved = resolveTarget(
			memory,
			fallback,
			target,
			(raw) => normalizeScopeKey(raw) as ScopeKey,
		);
		if (listedInProfile(memory, resolved.scope)) {
			hide(memory.store, resolved.id, input.reason);
			records.push({ ...noteEcho(resolved), action: "hidden" });
			continue;
		}
		propose(memory.store, {
			scope: resolved.scope,
			op: "hide",
			target: resolved.id,
			payload: { session: agent.id },
		});
		records.push({ ...noteEcho(resolved), action: "proposed" });
	}
	debug("Forget answered", {
		event: "forget",
		targets: input.targets.length,
	});
	return { records };
}
// #endregion FUNC_forgetAnswer

// #region FUNC_forgetTool
/**
 * @purpose Hide each target of the profile, or propose one hide for an invisible scope.
 */
export function forgetTool(agent: Agent, memory: AgentMemory): ToolDefinition {
	return defineTool({
		name: "memory_forget",
		description:
			"Hide memory records. A hidden record leaves the view and stays in the log. A target outside the profile scopes becomes a proposal for a human.",
		parameters: {
			targets: {
				type: "array",
				required: true,
				items: { oneOf: [{ type: "number" }, { type: "string" }] },
				description: "The records. A target is a pos or an address.",
			},
			scope: {
				type: "string",
				description:
					"The scope of a numeric target. The default is the active scope.",
			},
			reason: {
				type: "string",
				required: true,
				description: "The reason of the change, at most 200 characters.",
			},
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					records: {
						type: "array",
						required: true,
						items: {
							type: "object",
							additionalProperties: false,
							properties: {
								...ECHO_FIELDS,
								action: {
									type: "string",
									enum: ["hidden", "proposed"],
									required: true,
								},
							},
						},
					},
				},
			},
			render: (_args, value) =>
				blocks(
					value.records
						.map((row) => `${row.action} ${renderEcho(row)}`)
						.join("\n"),
				),
		},
		async execute(args) {
			return forgetAnswer(agent, memory, args);
		},
	});
}
// #endregion FUNC_forgetTool

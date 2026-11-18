/**
 * #region moduleContract
 * @purpose Serve the console reads and the console actions over the harness Remote service, so the
 *   tab reads and writes the memory of its own session with no plugin HTTP route.
 * @scope
 *  - The console method table, the session and scope resolution, the Remote service class, and the
 *    descriptor registration.
 *  - NOT: the read rules, the action rules, the status rules, the transport of the harness, the
 *    client mount, and the manifest.
 * @invariants The plugin registers the console namespace only when the Typert service is present.
 * @invariants The namespace and its descriptors end with the plugin context.
 * @invariants The session or the profile names the profile of the request. A requested scope must
 *   belong to that profile.
 * @invariants The transport checks each input and each answer with the strict contract schemas.
 * @invariants A Memlens error keeps its message and becomes one Remote error of the request.
 * @invariants The status answer states the store, so a surface that cannot read the store reports
 *   the cause and no build of a store that is not open.
 * @usecases
 *  - View: tab => calls memlens.view => gets the console model
 *  - Action: user => calls memlens.action => gets the changed note
 * @dependencies USES API: @deepseek-ai/cordis, @deepseek-ai/dsh-agent,
 *   @deepseek-ai/dsh-session, @deepseek-ai/dsh-typert-protocol, @deepseek-ai/dsh-typert-registry,
 *   @memlens/core, ../service.ts, ../worker.ts, remote-contract.ts, scope.ts, read.ts, action.ts,
 *   status.ts
 * @keywords console, remote, typert, service, descriptor, session, action, result
 * #endregion moduleContract
 */

import { debuglog } from "node:util";
import type { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type { SessionId } from "@deepseek-ai/dsh-session";
import {
	RemoteError,
	TypertRemoteService,
} from "@deepseek-ai/dsh-typert-protocol";
import type { TypertContribution } from "@deepseek-ai/dsh-typert-registry";
import { MemlensError } from "@memlens/core";
import type { Memlens } from "../service.js";
import type { MemoryWorker } from "../worker.js";
import { actionRoute } from "./action.js";
import { catalogAnswer, openAnswer, searchAnswer, viewAnswer } from "./read.js";
import {
	CONSOLE_NAMESPACE,
	CONSOLE_PACKAGE,
	CONSOLE_SERVICE,
	type ConsoleInputs,
	type ConsoleMethod,
	type ConsoleResults,
	consoleDescriptors,
	consoleSchemaFactories,
} from "./remote-contract.js";
import {
	type ConsoleRequest,
	type Fields,
	requestScope,
	text,
} from "./scope.js";
import { statusAnswer, trackSnapshots } from "./status.js";

const debug = debuglog("memlens:plugin:console");

/** One console answer function. */
type Handler = (request: ConsoleRequest) => unknown | Promise<unknown>;

/** The package model of the host contribution. The plugin exposes no reflected service. */
const EMPTY_MODEL = { services: [], events: [], objects: [] } as const;

// #region FUNC_hostContribution
/**
 * @purpose Build the host registration of the one console method table.
 * @invariants The invocation list is the descriptor list of the client contribution, so the two
 *   faces cannot drift.
 * @returns The contribution that the Typert registry accepts.
 */
function hostContribution(): TypertContribution {
	return {
		package: CONSOLE_PACKAGE,
		face: "host",
		schemas: consoleSchemaFactories(),
		model: EMPTY_MODEL,
		invocations: consoleDescriptors(),
	};
}
// #endregion FUNC_hostContribution

// #region CLASS_ConsoleRemote
/**
 * @purpose Give the harness Gateway one Remote service for the console operations of a surface.
 * @invariants The Cordis key is `memlensRemote` and the wire namespace is `memlens`.
 * @invariants A session input reads the agent, and a profile input reads the profile of the base
 *   file.
 * @invariants A disposed plugin removes the service and the descriptors together.
 */
export class ConsoleRemote extends TypertRemoteService {
	private readonly memlens: Memlens;
	private readonly worker: () => MemoryWorker | undefined;
	private readonly methods: Readonly<Record<ConsoleMethod, Handler>>;

	/**
	 * @param worker - Gives the background compaction worker of the host, or undefined while the
	 *   store is not open.
	 */
	constructor(
		ctx: Context,
		memlens: Memlens,
		worker: () => MemoryWorker | undefined,
	) {
		super(ctx, CONSOLE_SERVICE, { namespace: CONSOLE_NAMESPACE });
		this.memlens = memlens;
		this.worker = worker;
		this.methods = {
			view: viewAnswer,
			search: searchAnswer,
			open: openAnswer,
			catalog: catalogAnswer,
			status: (request) => statusAnswer(request, this.worker()),
			action: actionRoute,
		};
	}

	// #region METHOD_view
	/** @purpose Answer one console view. */
	view(input: ConsoleInputs["view"]): Promise<ConsoleResults["view"]> {
		return this.answer("view", input);
	}
	// #endregion METHOD_view

	// #region METHOD_search
	/** @purpose Answer one console search. */
	search(input: ConsoleInputs["search"]): Promise<ConsoleResults["search"]> {
		return this.answer("search", input);
	}
	// #endregion METHOD_search

	// #region METHOD_open
	/** @purpose Answer one console open. */
	open(input: ConsoleInputs["open"]): Promise<ConsoleResults["open"]> {
		return this.answer("open", input);
	}
	// #endregion METHOD_open

	// #region METHOD_catalog
	/** @purpose Answer one console catalog level. */
	catalog(input: ConsoleInputs["catalog"]): Promise<ConsoleResults["catalog"]> {
		return this.answer("catalog", input);
	}
	// #endregion METHOD_catalog

	// #region METHOD_status
	/** @purpose Answer the host state of one session. */
	status(input: ConsoleInputs["status"]): Promise<ConsoleResults["status"]> {
		return this.answer("status", input);
	}
	// #endregion METHOD_status

	// #region METHOD_action
	/** @purpose Apply one console action. */
	action(input: ConsoleInputs["action"]): Promise<ConsoleResults["action"]> {
		return this.answer("action", input);
	}
	// #endregion METHOD_action

	// #region METHOD_answer
	/**
	 * @purpose Resolve the session and run the method.
	 * @invariants A session that the host does not hold gives a request error.
	 * @invariants A Memlens error becomes one request error with its message.
	 * @param method - The console method of the call.
	 * @param input - The checked input of the call.
	 */
	private async answer<M extends ConsoleMethod>(
		method: M,
		input: ConsoleInputs[M],
	): Promise<ConsoleResults[M]> {
		const started = Date.now();
		try {
			const request = this.request(input);
			const answer = await this.methods[method](request);
			debug("Remote answered", {
				event: "answer",
				method,
				ms: Date.now() - started,
			});
			return answer as ConsoleResults[M];
		} catch (error) {
			if (error instanceof RemoteError) throw error;
			if (error instanceof MemlensError) {
				debug("Remote refused", {
					event: "refused",
					method,
					code: error.code,
				});
				throw new RemoteError("gateway/bad-request", error.message, {});
			}
			debug("Remote failed", { event: "error", method });
			throw error;
		}
	}
	// #endregion METHOD_answer

	// #region METHOD_request
	/**
	 * @purpose Give the memory inputs, the scope, the fields, and the profiles of one call.
	 * @invariants The session field names the agent of a session surface.
	 * @invariants Without a session, the profile field names the profile of a profile surface, and
	 *   an empty field names the default profile of the base file.
	 * @invariants The host holds no other profile and no other store.
	 * @param input - The input object of the call.
	 */
	private request<M extends ConsoleMethod>(
		input: ConsoleInputs[M],
	): ConsoleRequest {
		const fields = input as Fields;
		const profiles = this.memlens.profiles();
		const session = fields.session;
		if (typeof session === "string" && session !== "") {
			const agent: Agent | undefined = this.ctx
				.get("agents")
				?.get(session as SessionId);
			if (agent === undefined) {
				debug("Session unknown", { event: "session", session });
				throw new RemoteError(
					"gateway/bad-request",
					"The session is unknown.",
					{},
				);
			}
			const memory = this.memlens.forAgent(agent);
			return {
				agent,
				memory,
				scope: requestScope(memory, text(fields, "scope")),
				fields,
				profiles,
			};
		}
		const requested = text(fields, "profile");
		const profile =
			requested === "" ? this.memlens.resolved.defaultProfile : requested;
		const memory = this.memlens.forProfile(profile);
		return {
			memory,
			scope: requestScope(memory, text(fields, "scope"), true),
			fields,
			profiles,
		};
	}
	// #endregion METHOD_request
}
// #endregion CLASS_ConsoleRemote

// #region FUNC_registerConsoleRemote
/**
 * @purpose Register the console Remote service and its descriptors for the session that owns the
 *   tab.
 * @invariants A host without the Typert service registers nothing and throws no error.
 * @invariants The disposer ends the descriptors, the service, and the snapshot tracker.
 * @param worker - Gives the background compaction worker of the host, or undefined while the
 *   store is not open.
 * @returns The disposer that ends the console namespace.
 */
export function registerConsoleRemote(
	ctx: Context,
	memlens: Memlens,
	worker: () => MemoryWorker | undefined,
): () => Promise<void> {
	const fiber = ctx.inject(["typert"], (remoteCtx) => {
		new ConsoleRemote(remoteCtx, memlens, worker);
		remoteCtx.effect(
			() => trackSnapshots(remoteCtx),
			"memlens: snapshot tracker",
		);
		remoteCtx.effect(
			() => remoteCtx.typert.register(hostContribution()),
			"memlens: console remote",
		);
		debug("Remote registered", {
			event: "register",
			namespace: CONSOLE_NAMESPACE,
		});
	});
	return () => fiber.dispose();
}
// #endregion FUNC_registerConsoleRemote

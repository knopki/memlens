/**
 * #region moduleContract
 * @purpose Serve the console data and the console actions over the harness Web server, so the tab
 *   reads and writes the memory of its own session.
 * @scope
 *  - The prefix route, the Connection check, the route table, the session and scope resolution,
 *    and the JSON answer.
 *  - NOT: the transport rules of the harness, the reads, the actions, and the status.
 * @invariants The route claims the prefix `/plugins/memlens` and no other path.
 * @invariants The plugin registers no route when the Web server is absent, and the route ends with
 *   its context.
 * @invariants The session names the profile and the scope. The request fields name neither.
 * @invariants The answer holds no CORS header.
 * @invariants The delete action is permitted here, because the route checks the connection.
 * @dependencies @deepseek-ai/cordis, @deepseek-ai/dsh-agent, @deepseek-ai/dsh-session,
 *   @memlens/core, ../service.ts, ../worker.ts, scope.ts, read.ts, action.ts, status.ts
 * @keywords console, http, route, session, trust, json, action, status
 * #endregion moduleContract
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { debuglog } from "node:util";
import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-agent";
import type { SessionId } from "@deepseek-ai/dsh-session";
import { MemlensError } from "@memlens/core";
import type { Memlens } from "../service.js";
import type { MemoryWorker } from "../worker.js";
import { actionRoute } from "./action.js";
import { catalogAnswer, openAnswer, searchAnswer, viewAnswer } from "./read.js";
import {
	type ConsoleRequest,
	type Fields,
	requestScope,
	text,
} from "./scope.js";
import { statusAnswer, trackSnapshots } from "./status.js";

const debug = debuglog("memlens:plugin:console");

/** The route prefix of the console data. */
const ROUTE_PATH = "/plugins/memlens";

/** The greatest body that the action route reads, in bytes. */
const MAX_BODY = 2 * 1024 * 1024;

/** The Web server surface that the console route needs. The host service satisfies it. */
interface WebServer {
	register(route: {
		readonly kind: "prefix";
		readonly path: string;
		readonly handler: (
			request: IncomingMessage,
			response: ServerResponse,
		) => void | Promise<void>;
	}): () => void;
}

/** The trust check that the Connection service offers. The service stays optional. */
interface Connection {
	requestRejection(request: {
		readonly headers: IncomingMessage["headers"];
	}): 401 | 403 | undefined;
}

/** One route of the console: the accepted method and the answer. */
interface Route {
	readonly method: "GET" | "POST";
	readonly handler: (request: ConsoleRequest) => unknown | Promise<unknown>;
}

// #region FUNC_registerConsole
/**
 * @purpose Register the console route for the session that owns the tab.
 * @invariants A host without the Web server keeps no route and throws no error.
 * @invariants The profile and the scope come from the session, so one tab cannot name another.
 * @param ctx - The host context that owns the route.
 * @param memlens - The service with the store, the profiles, and the session memory.
 * @param worker - The background compaction worker of the host.
 * @returns The disposer that ends the route and the snapshot tracker.
 */
export function registerConsole(
	ctx: Context,
	memlens: Memlens,
	worker: MemoryWorker,
): () => Promise<void> {
	const routes: ReadonlyMap<string, Route> = new Map<string, Route>([
		["/view", { method: "GET", handler: viewAnswer }],
		["/search", { method: "GET", handler: searchAnswer }],
		["/open", { method: "GET", handler: openAnswer }],
		["/catalog", { method: "GET", handler: catalogAnswer }],
		[
			"/status",
			{ method: "GET", handler: (request) => statusAnswer(request, worker) },
		],
		["/action", { method: "POST", handler: actionRoute }],
	]);
	const fiber = ctx.inject(["webServer"], (routeCtx) => {
		const webServer = routeCtx.get("webServer") as WebServer | undefined;
		if (webServer === undefined) {
			debug("Web server absent", { event: "inactive" });
			return;
		}
		routeCtx.effect(
			() => trackSnapshots(routeCtx),
			"memlens: snapshot tracker",
		);
		routeCtx.effect(
			() =>
				webServer.register({
					kind: "prefix",
					path: ROUTE_PATH,
					handler: (request, response) =>
						serve(routeCtx, memlens, routes, request, response),
				}),
			"memlens: console route",
		);
		debug("Route registered", { event: "register", path: ROUTE_PATH });
	});
	return () => fiber.dispose();
}
// #endregion FUNC_registerConsole

// #region FUNC_serve
/**
 * @purpose Answer one console request.
 * @invariants A rejected request gives the status of the Connection check.
 * @invariants An unknown path gives 404, a wrong method gives 405, and an unknown session gives
 *   404. A MemlensError gives its own status.
 * @param ctx - The context that reads the optional services.
 * @param memlens - The service with the store and the session memory.
 * @param routes - The route table of this console.
 * @param request - The request that owns the answer.
 * @param response - The response that the handler writes.
 */
async function serve(
	ctx: Context,
	memlens: Memlens,
	routes: ReadonlyMap<string, Route>,
	request: IncomingMessage,
	response: ServerResponse,
): Promise<void> {
	const started = Date.now();
	try {
		const connection = ctx.get("connection") as Connection | undefined;
		const rejection = connection?.requestRejection(request);
		if (rejection !== undefined) {
			debug("Request rejected", { event: "trust", status: rejection });
			send(response, rejection, {
				error:
					rejection === 401
						? "The request needs authentication."
						: "The request must come from this console.",
			});
			return;
		}
		const url = new URL(request.url ?? "/", "http://console.invalid");
		const suffix = url.pathname.slice(ROUTE_PATH.length);
		const route = routes.get(suffix);
		if (route === undefined) {
			send(response, 404, { error: "No such route." });
			return;
		}
		if (request.method !== route.method) {
			send(response, 405, { error: "The method is not allowed." });
			return;
		}
		const body: Fields =
			request.method === "POST" ? await readBody(request) : {};
		const fields: Fields = {
			...Object.fromEntries(url.searchParams),
			...body,
		};
		const session = text(fields, "session");
		if (!session)
			throw new MemlensError("Usage", "The request needs a session.");
		const agent = ctx.get("agents")?.get(session as SessionId);
		if (agent === undefined) {
			debug("Session unknown", { event: "session", session });
			send(response, 404, { error: "The session is unknown." });
			return;
		}
		const memory = memlens.forAgent(agent);
		const scope = requestScope(memory, text(fields, "scope"));
		const answer = await route.handler({ agent, memory, scope, fields });
		send(response, 200, answer);
		debug("Request done", {
			event: "response",
			path: suffix,
			status: 200,
			ms: Date.now() - started,
		});
	} catch (error) {
		respondError(response, error);
	}
}
// #endregion FUNC_serve

// #region FUNC_readBody
/**
 * @purpose Read the body of one write request.
 * @invariants The content type is application/json. A body that is not JSON object text, or is
 *   over 2 MiB, gives a Usage error.
 * @param request - The request that owns the body stream.
 */
async function readBody(request: IncomingMessage): Promise<Fields> {
	if (
		request.headers["content-type"]?.split(";")[0]?.trim() !==
		"application/json"
	)
		throw new MemlensError("Usage", "The action needs application/json.");
	const chunks: Buffer[] = [];
	let bytes = 0;
	for await (const chunk of request) {
		bytes += chunk.length;
		if (bytes > MAX_BODY)
			throw new MemlensError("Usage", "The request body is too large.");
		chunks.push(chunk);
	}
	let value: unknown;
	try {
		value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
	} catch {
		throw new MemlensError("Usage", "The request body must be JSON.");
	}
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new MemlensError("Usage", "The action must be an object.");
	return value as Fields;
}
// #endregion FUNC_readBody

// #region FUNC_send
/** @purpose Write one JSON answer with its status and no CORS header. */
function send(response: ServerResponse, status: number, value: unknown): void {
	if (response.headersSent) {
		response.end();
		return;
	}
	response.writeHead(status, {
		"Content-Type": "application/json; charset=utf-8",
		"Cache-Control": "no-store",
		"X-Content-Type-Options": "nosniff",
	});
	response.end(JSON.stringify(value));
}
// #endregion FUNC_send

// #region FUNC_respondError
/**
 * @purpose Answer one failed request.
 * @invariants A policy refusal gives 403, a usage error gives 400, and a data error gives 422.
 */
function respondError(response: ServerResponse, error: unknown): void {
	const status =
		error instanceof MemlensError
			? error.code === "NotAllowed"
				? 403
				: error.code === "Usage"
					? 400
					: 422
			: 500;
	debug("Request failed", {
		event: "error",
		status,
		code: error instanceof MemlensError ? error.code : "Internal",
	});
	send(response, status, {
		error: error instanceof Error ? error.message : "The request failed.",
	});
}
// #endregion FUNC_respondError

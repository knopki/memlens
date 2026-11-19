/**
 * Console host.
 *
 * #region moduleContract
 * @modulecontract
 * @purpose Give a human a local console without the harness.
 * @scope
 *  - Loopback HTTP, static assets, the request route, and the command ui.
 *  - NOT: the read routes, the actions, and the scope rules of the host modules.
 * @invariants The console must never enable CORS.
 * @invariants Each request opens its selected profile and closes its store, including on failure.
 * @usecases
 *  - Start: user => runs memlens ui => gets the console address
 * @dependencies USES API: @memlens/core
 * @keywords ui, console, loopback, http, route, asset, host
 * #endregion moduleContract
 */

import { once } from "node:events";
import { readFile } from "node:fs/promises";
import {
	createServer,
	type IncomingMessage,
	type ServerResponse,
} from "node:http";
import { debuglog } from "node:util";
import { MemlensError, text } from "@memlens/core";
import type { ParsedArgs } from "./args.js";
import { type CommandIo, countFlag, flagValue } from "./commands.js";
import { actionRoute } from "./host/action.js";
import {
	type Handler,
	type HostOptions,
	methodAllowed,
	readBody,
	requestUrl,
	respondError,
	send,
	setHeaders,
} from "./host/http.js";
import { READ_ROUTES } from "./host/read.js";
import { resolveScope } from "./host/scope.js";
import { openRuntime } from "./runtime.js";

const debug = debuglog("memlens:ui");

/** Each static asset of the console, with its content type. */
const ASSETS: Readonly<Record<string, readonly [string, string]>> = {
	"/": ["index.html", "text/html; charset=utf-8"],
	"/client.js": ["client.js", "text/javascript; charset=utf-8"],
	"/style.css": ["style.css", "text/css; charset=utf-8"],
};

// #region FUNC_startUi
/**
 * Start one standalone console.
 *
 * @purpose Give the command ui and the tests one console with one address and one close.
 * @invariants The port is a whole number from 0 to 65535. The server binds to 127.0.0.1 only.
 */
export async function startUi(options: HostOptions) {
	const port = options.port ?? 7788;
	if (!Number.isInteger(port) || port < 0 || port > 65535)
		throw new MemlensError("Usage", "The port must be between 0 and 65535.");
	const server = createServer((request, response) => {
		void route(request, response, options).catch((error: unknown) =>
			respondError(response, error),
		);
	});
	server.requestTimeout = 15_000;
	server.headersTimeout = 10_000;
	server.listen(port, "127.0.0.1");
	await once(server, "listening");
	const address = server.address();
	if (!address || typeof address === "string")
		throw new Error("The server has no port.");
	debug("Console started", {
		event: "listen",
		port: address.port,
		allowDelete: options.allowDelete === true,
	});
	return {
		url: `http://127.0.0.1:${address.port}`,
		close: async () => {
			server.closeIdleConnections();
			await new Promise<void>((resolve, reject) =>
				server.close((error) => (error ? reject(error) : resolve())),
			);
			debug("Console stopped", { event: "close" });
		},
	};
}
// #endregion FUNC_startUi

// #region FUNC_uiCommand
/**
 * Start the console from the CLI.
 *
 * @purpose Apply the command flags to one host, so a user starts the console with one line.
 * @invariants The port comes from --port and must be from 1 to 65535.
 */
export async function uiCommand(
	args: ParsedArgs,
	io: CommandIo,
): Promise<string> {
	const port = countFlag(args.flags, "port", 7788);
	if (port < 1 || port > 65535)
		throw new MemlensError("Usage", "The port must be between 1 and 65535.");
	const host = await startUi({
		storeFlag: flagValue(args.flags, "store"),
		env: io.env,
		cwd: io.cwd,
		port,
		allowDelete: args.flags["allow-delete"] === true,
	});
	const stop = () => {
		void host.close();
	};
	process.once("SIGINT", stop);
	process.once("SIGTERM", stop);
	return host.url;
}
// #endregion FUNC_uiCommand

// #region FUNC_route
/**
 * Answer one request of the console.
 *
 * @purpose Send each request to one read route or the action route, so the host has one entry.
 * @invariants A foreign host or origin gives NotAllowed. A write needs the method POST.
 */
async function route(
	request: IncomingMessage,
	response: ServerResponse,
	options: HostOptions,
): Promise<void> {
	const url = requestUrl(request);
	debug("Request start", {
		event: "request",
		method: request.method,
		path: url.pathname,
	});
	setHeaders(response);
	if (await serveAsset(url, request, response)) return;
	if (!url.pathname.startsWith("/api/")) {
		send(response, 404, { error: "No such route." });
		return;
	}
	if (!methodAllowed(url.pathname, request.method)) {
		send(response, 405, { error: "The method is not allowed." });
		return;
	}
	const fields =
		request.method === "POST"
			? await readBody(request)
			: Object.fromEntries(url.searchParams);
	const runtime = await openRuntime({
		storeFlag: options.storeFlag,
		profile: text(fields, "profile") || null,
		env: options.env ?? process.env,
	});
	try {
		const scope = resolveScope(runtime, fields, options);
		const handler: Handler | undefined =
			url.pathname === "/api/action" ? actionRoute : READ_ROUTES[url.pathname];
		if (handler === undefined) {
			send(response, 404, { error: "No such route." });
			return;
		}
		send(response, 200, await handler(runtime, fields, scope, options));
		debug("Request done", {
			event: "response",
			path: url.pathname,
			status: 200,
		});
	} finally {
		await runtime.close();
	}
}
// #endregion FUNC_route

// #region FUNC_serveAsset
/** @return True when the request names one static asset and the answer holds it. */
async function serveAsset(
	url: URL,
	request: IncomingMessage,
	response: ServerResponse,
): Promise<boolean> {
	const asset = ASSETS[url.pathname];
	if (asset === undefined || request.method !== "GET") return false;
	response.writeHead(200, { "Content-Type": asset[1] });
	response.end(await readFile(new URL(`./ui/${asset[0]}`, import.meta.url)));
	return true;
}
// #endregion FUNC_serveAsset

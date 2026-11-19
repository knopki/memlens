/**
 * Console request transport.
 *
 * #region moduleContract
 * @modulecontract
 * @purpose Move one request and one answer between the loopback client and the host, so the route
 *   code holds no HTTP detail.
 * @scope
 *  - The trusted request URL, the JSON body read, the response headers, the JSON answer, and the
 *    error answer.
 *  - NOT: routing, scope rules, and action semantics.
 * @invariants A request from a foreign host or origin gives NotAllowed.
 * @usecases
 *  - Answer: host => gives one value => writes one JSON response
 * @dependencies USES API: @memlens/core
 * @keywords ui, http, body, header, answer, trust, json
 * #endregion moduleContract
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { debuglog } from "node:util";
import { MemlensError, type ScopeKey } from "@memlens/core";
import type { Runtime } from "../runtime.js";

const debug = debuglog("memlens:ui");

/** One request body or query, with the fields of the console. */
export type Fields = Record<string, unknown>;

/** The options of one console host. */
export interface HostOptions {
	readonly storeFlag: string | null;
	readonly env?: Record<string, string | undefined>;
	readonly cwd?: string;
	readonly port?: number;
	readonly allowDelete?: boolean;
}

/** One console handler: one read route or the action route. */
export type Handler = (
	runtime: Runtime,
	fields: Fields,
	scope: ScopeKey,
	options: HostOptions,
) => unknown | Promise<unknown>;

// #region FUNC_text
/** @purpose Give one text field of the request, so a value of a wrong type gives a Usage error. */
export function text(fields: Fields, key: string): string {
	const value = fields[key];
	if (value === undefined) return "";
	if (typeof value !== "string")
		throw new MemlensError("Usage", `The field ${key} must be text.`);
	return value;
}
// #endregion FUNC_text

// #region FUNC_requestUrl
/**
 * Read the URL of one trusted request.
 *
 * @purpose Reject a request outside the loopback origin, so a page of another site cannot act on
 *   the memory.
 * @invariants The host header names the loopback port. A present origin is the same origin.
 */
export function requestUrl(request: IncomingMessage): URL {
	const port = request.socket.localPort;
	const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
	const host = request.headers.host ?? "";
	if (
		!hosts.includes(host) ||
		(request.headers.origin !== undefined &&
			request.headers.origin !== `http://${host}`)
	)
		throw new MemlensError(
			"NotAllowed",
			"The request must come from this console.",
		);
	return new URL(request.url ?? "/", `http://${host}`);
}
// #endregion FUNC_requestUrl

// #region FUNC_setHeaders
/** @purpose Set the headers of each console answer. */
export function setHeaders(response: ServerResponse): void {
	response.setHeader("Cache-Control", "no-store");
	response.setHeader("X-Content-Type-Options", "nosniff");
	response.setHeader(
		"Content-Security-Policy",
		"default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
	);
}
// #endregion FUNC_setHeaders

// #region FUNC_methodAllowed
/** @purpose Tell whether the method fits the route, so a wrong method gives 405. */
export function methodAllowed(
	pathname: string,
	method: string | undefined,
): boolean {
	return pathname === "/api/action" ? method === "POST" : method === "GET";
}
// #endregion FUNC_methodAllowed

// #region FUNC_readBody
/**
 * Read the body of one write request.
 *
 * @purpose Reject a malformed or oversized action payload before the host opens a store.
 * @invariants The content type is application/json. A body that is not JSON object text, or is over
 *   2 MiB, gives a Usage error.
 */
export async function readBody(request: IncomingMessage): Promise<Fields> {
	if (
		request.headers["content-type"]?.split(";")[0]?.trim() !==
		"application/json"
	)
		throw new MemlensError("Usage", "The action needs application/json.");
	const chunks: Buffer[] = [];
	let bytes = 0;
	for await (const chunk of request) {
		bytes += chunk.length;
		if (bytes > 2 * 1024 * 1024)
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
/** @purpose Write one JSON answer with its status. */
export function send(
	response: ServerResponse,
	status: number,
	value: unknown,
): void {
	response.writeHead(status, {
		"Content-Type": "application/json; charset=utf-8",
	});
	response.end(JSON.stringify(value));
}
// #endregion FUNC_send

// #region FUNC_respondError
/**
 * Answer one failed request.
 *
 * @purpose Map each command error to one HTTP status, so the client shows one message.
 * @invariants A policy refusal gives 403, a usage error gives 400, and a data error gives 422.
 */
export function respondError(response: ServerResponse, error: unknown): void {
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

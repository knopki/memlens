/**
 * #region moduleContract
 * @purpose Hold the HTTP port to the shapes of the CLI routes, the no-store read, the JSON action
 * body, and the two error texts.
 * @scope The five routes and the failed answers.
 * #endregion moduleContract
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { createHttpPort } from "../../src/model/transport.js";

/** Build one answer with a JSON body. */
function answer(value: unknown, status = 200): Response {
	return {
		ok: status >= 200 && status < 300,
		status,
		text: async () => (value === undefined ? "" : JSON.stringify(value)),
	} as unknown as Response;
}

/** Build one answer with a raw body. */
function raw(body: string, status = 200): Response {
	return {
		ok: status >= 200 && status < 300,
		status,
		text: async () => body,
	} as unknown as Response;
}

/** Put one fake fetch on the global scope and give its mock. */
function stubFetch(...responses: Response[]) {
	let index = 0;
	const fake = vi.fn(async () => responses[index++] ?? answer(null));
	vi.stubGlobal("fetch", fake);
	return fake;
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("console HTTP port", () => {
	it("reads the view with no store cache", async () => {
		const fetch = stubFetch(answer({ profile: "p" }));
		const port = createHttpPort("/api");
		await port.view({ profile: "p", scope: "project:alpha", kind: "task" });
		expect(fetch).toHaveBeenCalledWith(
			"/api/view?profile=p&scope=project%3Aalpha&kind=task",
			{ cache: "no-store" },
		);
	});

	it("names the screen of the view", async () => {
		const fetch = stubFetch(answer({ profile: "p" }));
		const port = createHttpPort("/api");
		await port.view({
			profile: "p",
			scope: "project:alpha",
			kind: "",
			screen: "tree",
		});
		expect(fetch).toHaveBeenCalledWith(
			"/api/view?profile=p&scope=project%3Aalpha&kind=&screen=tree",
			{ cache: "no-store" },
		);
	});

	it("reads the search of the base", async () => {
		const fetch = stubFetch(answer([]));
		const port = createHttpPort("/api");
		await port.search({
			profile: "p",
			scope: "",
			query: "two words",
			kind: "",
			since: "",
			limit: "10",
		});
		expect(fetch).toHaveBeenCalledWith(
			"/api/search?profile=p&scope=&query=two+words&kind=&since=&limit=10",
			{ cache: "no-store" },
		);
	});

	it("reads the open and the catalog of a range", async () => {
		const fetch = stubFetch(answer({}), answer([]));
		const port = createHttpPort("/api");
		await port.open({ profile: "p", scope: "s", target: "s#1" });
		await port.catalog({ profile: "p", scope: "s", start: 0, level: 1 });
		expect(fetch).toHaveBeenNthCalledWith(
			1,
			"/api/open?profile=p&scope=s&target=s%231",
			{ cache: "no-store" },
		);
		expect(fetch).toHaveBeenNthCalledWith(
			2,
			"/api/catalog?profile=p&scope=s&start=0&level=1",
			{ cache: "no-store" },
		);
	});

	it("posts one action as a JSON object", async () => {
		const fetch = stubFetch(answer({ ok: true }));
		const port = createHttpPort("/api");
		const result = await port.action("note", {
			profile: "p",
			scope: "s",
			body: "b",
		});
		expect(result).toEqual({ ok: true });
		expect(fetch).toHaveBeenCalledWith("/api/action", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				profile: "p",
				scope: "s",
				body: "b",
				action: "note",
			}),
		});
	});

	it("gives the status of an answer that is not JSON", async () => {
		stubFetch(raw("<html>", 502));
		const port = createHttpPort("/api");
		await expect(
			port.view({ profile: "p", scope: "s", kind: "" }),
		).rejects.toThrow("HTTP 502: invalid JSON.");
	});

	it("gives the error text of a failed answer", async () => {
		stubFetch(raw(JSON.stringify({ error: "The note does not exist." }), 422));
		const port = createHttpPort("/api");
		await expect(port.action("review", {})).rejects.toThrow(
			"The note does not exist.",
		);
	});

	it("gives the status of a failed answer without an error text", async () => {
		stubFetch(raw("null", 500));
		const port = createHttpPort("/api");
		await expect(port.action("review", {})).rejects.toThrow("HTTP 500");
	});

	it("uses the text function of the shell", async () => {
		stubFetch(raw("<html>", 500));
		const port = createHttpPort("/api", (key) => `T:${key}`);
		await expect(
			port.view({ profile: "p", scope: "s", kind: "" }),
		).rejects.toThrow("T:badJson");
	});
});

/**
 * #region moduleContract
 * @vitest-environment happy-dom
 * @purpose Hold the shell to the browser wiring that a server render cannot show: a click, a pick,
 * a key, and a typed field reach the controller, and the page redraws from the new state.
 * @scope The rail, the header pickers, the number keys, the theme attribute, and the record form.
 * @invariants Each test mounts the real shell on a real controller with a fake port.
 * @invariants Each test sends DOM events as a browser sends them, and no state goes in by hand.
 * @dependencies USES: React, the shell, the controller harness of the model tests, and happy-dom.
 * @keywords test, interaction, click, select, keyboard, form, theme, happy-dom
 * #endregion moduleContract
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { fill, messages } from "../../src/i18n.js";
import type { ConsoleApi, Translate } from "../../src/model/console.js";
import { App } from "../../src/standalone/app.js";
import { type Harness, harness, viewOf } from "../model/helpers.js";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/** The console api of each mounted test, for the cleanup. */
const mounted: Root[] = [];

// #region FUNC_apiOf
/**
 * @purpose Build one console api on the harness, with the text of the state language.
 * @invariants The text function reads the live state, so a language choice changes the page.
 */
function apiOf(h: Harness): ConsoleApi {
	const t: Translate = (key, values = {}) =>
		fill(messages(h.state().lang)[key], values);
	return {
		get state() {
			return h.state();
		},
		subscribe: h.store.subscribe,
		t,
		call: h.call,
	};
}
// #endregion FUNC_apiOf

// #region FUNC_mount
/**
 * @purpose Mount the shell on one harness and give the test its container.
 */
async function mount(h: Harness): Promise<HTMLElement> {
	const container = document.createElement("div");
	document.body.append(container);
	const root = createRoot(container);
	mounted.push(root);
	const api = apiOf(h);
	await act(async () => {
		root.render(<App api={api} />);
	});
	return container;
}
// #endregion FUNC_mount

// #region FUNC_need
/**
 * @purpose Give one element of the page, and fail the test when the page holds none.
 */
function need(container: ParentNode, selector: string): Element {
	const element = container.querySelector(selector);
	if (!element) throw new Error(`The page holds no ${selector}.`);
	return element;
}
// #endregion FUNC_need

// #region FUNC_setNative
/**
 * @purpose Write one value through the native setter, so React sees the change that a browser makes.
 */
function setNative(element: Element, value: string): void {
	const target = element as
		| HTMLInputElement
		| HTMLTextAreaElement
		| HTMLSelectElement;
	const proto =
		target instanceof HTMLSelectElement
			? HTMLSelectElement.prototype
			: target instanceof HTMLTextAreaElement
				? HTMLTextAreaElement.prototype
				: HTMLInputElement.prototype;
	Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(target, value);
}
// #endregion FUNC_setNative

// #region FUNC_click
/**
 * @purpose Send one click to one element of the page.
 */
async function click(container: ParentNode, selector: string): Promise<void> {
	const element = need(container, selector);
	await act(async () => {
		element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	});
}
// #endregion FUNC_click

// #region FUNC_pick
/**
 * @purpose Choose one option of one select, as a browser sends the change.
 */
async function pick(
	container: ParentNode,
	selector: string,
	value: string,
): Promise<void> {
	const element = need(container, selector);
	await act(async () => {
		setNative(element, value);
		element.dispatchEvent(new Event("change", { bubbles: true }));
	});
}
// #endregion FUNC_pick

// #region FUNC_type
/**
 * @purpose Type one text into one field, as a browser sends the input.
 */
async function type(
	container: ParentNode,
	selector: string,
	value: string,
): Promise<void> {
	const element = need(container, selector);
	await act(async () => {
		setNative(element, value);
		element.dispatchEvent(new Event("input", { bubbles: true }));
	});
}
// #endregion FUNC_type

// #region FUNC_key
/**
 * @purpose Press one number key on one element, as a browser sends the keydown.
 */
async function key(target: EventTarget, text: string): Promise<void> {
	await act(async () => {
		target.dispatchEvent(
			new KeyboardEvent("keydown", { key: text, bubbles: true }),
		);
	});
}
// #endregion FUNC_key

// #region FUNC_headingOf
/**
 * @purpose Give the heading of the live screen.
 */
function headingOf(container: ParentNode): string {
	return need(container, "main h1").textContent ?? "";
}
// #endregion FUNC_headingOf

afterEach(async () => {
	for (const root of mounted) {
		await act(async () => {
			root.unmount();
		});
	}
	mounted.length = 0;
	document.body.replaceChildren();
	delete document.documentElement.dataset.theme;
});

describe("standalone interaction", () => {
	it("opens the screen of a rail click", async () => {
		const h = harness({}, { model: viewOf() });
		const container = await mount(h);

		await click(container, "aside nav button:nth-child(4)");

		expect(h.state().screen).toBe("search");
		expect(h.writes).toHaveLength(1);
		expect(h.writes[0]?.step).toBe("push");
		expect(
			need(container, 'aside nav button[aria-current="page"]').textContent,
		).toBe(messages("en").nav3);
		expect(headingOf(container)).toBe(messages("en").nav3);
	});

	it("sends the filters of the search form for an empty query", async () => {
		const h = harness({}, { model: viewOf() });
		const container = await mount(h);
		await click(container, "aside nav button:nth-child(4)");

		// The kind buttons are in the order of the store: fact is the third, and task is the fifth.
		await click(container, ".kinds button:nth-child(3)");
		await click(container, ".kinds button:nth-child(5)");
		await pick(container, ".filters label:nth-of-type(4) input", "2026-11-30");
		await click(container, '.filters input[type="checkbox"]');
		await key(need(container, ".searchbar input"), "Enter");

		expect(h.calls.find((call) => call.method === "search")?.fields).toEqual({
			profile: "default",
			query: "",
			scopes: "project:alpha",
			kinds: "fact,task",
			since: "",
			until: "2026-11-30",
			due: "1",
			limit: "10",
		});
	});

	it("opens the screen of a number key", async () => {
		const h = harness({}, { model: viewOf() });
		const container = await mount(h);

		await key(document, "3");

		expect(h.state().screen).toBe("catalog");
		expect(headingOf(container)).toBe(messages("en").nav2);
	});

	it("keeps the screen when a picker holds the focus", async () => {
		const h = harness({}, { model: viewOf() });
		const container = await mount(h);
		const select = need(container, "#profile") as HTMLSelectElement;
		select.focus();

		await key(select, "3");

		expect(h.state().screen).toBe("overview");
	});

	it("takes the language of a header picker", async () => {
		const h = harness({}, { model: viewOf() });
		const container = await mount(h);

		await pick(container, "#lang", "ru");

		expect(h.state().lang).toBe("ru");
		expect(h.storage.data["memlens.lang"]).toBe("ru");
		expect(headingOf(container)).toBe(messages("ru").nav0);
	});

	it("puts the theme of a header picker on the page", async () => {
		const h = harness({}, { model: viewOf() });
		const container = await mount(h);

		await pick(container, "#theme", "dark");

		expect(h.state().theme).toBe("dark");
		expect(h.storage.data["memlens.theme"]).toBe("dark");
		expect(document.documentElement.dataset.theme).toBe("dark");
	});

	it("saves the draft that the record form took", async () => {
		const h = harness({}, { model: viewOf() });
		const container = await mount(h);
		await act(async () => {
			h.call.newNote();
		});

		await type(container, "dialog textarea", "hello");
		await act(async () => {
			need(container, "dialog form").dispatchEvent(
				new Event("submit", { bubbles: true, cancelable: true }),
			);
		});

		const saved = h.calls.find(
			(call) => call.method === "action" && call.name === "note",
		);
		expect(saved?.fields).toMatchObject({
			body: "hello",
			kind: "note",
			scope: "project:alpha",
		});
		expect(h.state().dialog).toBeNull();
	});
});

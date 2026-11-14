/**
 * #region moduleContract
 * @purpose Guard the memory tab against a lost session, a lost locale fallback, and a broken screen
 *   registry, so the tab draws each screen inside the harness page.
 * @scope The tab registration, the locale dictionaries and their fallback, the tab console port,
 *   the tab body, the screen registry, and the stylesheet rules.
 * NOT: the host route and the built artifact.
 * @invariants Each test renders from a fake port or a fake console API. No host call leaves the
 * test.
 * @dependencies USES: the client entry, the tab body, the screen registry, the message table, and
 * the server renderer of the console package.
 * @keywords test, client, tab, session, locale, fallback, screen, style
 * #endregion moduleContract
 */

import { createRequire } from "node:module";
import type { ComponentType, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SCREEN_COMPONENTS } from "../../ui/src/components/screens/index.js";
import { fill, messages } from "../../ui/src/i18n.js";
import type {
	ConsoleActions,
	ConsoleApi,
	ConsoleState,
	Translate,
} from "../../ui/src/model/console.js";
import { DEFAULT_ROUTE, SCREENS } from "../../ui/src/route.js";
import type { View } from "../../ui/src/types.js";
import { createTabConsole } from "../src/client/console.js";
import type {
	ClientContext,
	LocaleService,
	SlotRegistration,
} from "../src/client/context.js";
import { apply } from "../src/client/index.js";
import { NS, TAB_KEY } from "../src/client/locales.js";
import { TAB_CSS } from "../src/client/styles.js";
import { MemoryView } from "../src/client/view.js";

/** The renderer of the console package. The plugin holds no react-dom of its own. */
const requireUi = createRequire(import.meta.url);
const { renderToStaticMarkup } = requireUi(
	"../../ui/node_modules/react-dom/server.js",
) as { renderToStaticMarkup: (node: ReactNode) => string };

/** The English text function of the test. */
const english: Translate = (key, values = {}) =>
	fill(messages("en")[key] ?? "", values);

// #region FUNC_viewOf
/**
 * @purpose Build one console view with two scopes, one frontier line, and one due note.
 */
function viewOf(): View {
	return {
		profile: "default",
		scope: "project:alpha",
		scopes: [
			{
				key: "project:alpha",
				total: 2,
				live: 2,
				hidden: 0,
				deleted: 0,
				frontier: "alpha one",
			},
			{
				key: "project:beta",
				total: 0,
				live: 0,
				hidden: 0,
				deleted: 0,
				frontier: "",
			},
		],
		here: "",
		directions: "",
		text: "# project:alpha\nnote one",
		budgets: {
			here: { used: 1, limit: 10 },
			directions: { used: 0, limit: 10 },
		},
		records: [
			{ scope: "project:alpha", state: "live", kind: "note", pos: 0 },
			{ scope: "project:alpha", state: "live", kind: "note", pos: 1 },
		],
		nodes: [],
		candidates: [],
		catalog: [],
		catalogScopes: ["project:alpha", "project:beta"],
		frontier: [
			{
				kind: "record",
				pos: 0,
				from: "2026-11-01T00:00:00Z",
				to: "2026-11-01T00:00:00Z",
				body: "note one",
			},
		],
		review: [],
		reviewNext: [],
		reviewNextTotal: 0,
		revision: "rev-1",
		proposals: [],
		profiles: ["default"],
		path: "/tmp/memlens.db",
		backend: "fake",
		allowDelete: false,
		reviewPolicy: {
			decision: 7,
			preference: 30,
			fact: 30,
			task: 7,
			note: 30,
		},
	} as unknown as View;
}
// #endregion FUNC_viewOf

// #region FUNC_stateOf
/**
 * @purpose Build one console state from the fixed view and an optional patch.
 * @param patch - The fields that the test changes.
 */
function stateOf(patch: Partial<ConsoleState> = {}): ConsoleState {
	return {
		model: viewOf(),
		profile: "default",
		scope: "project:alpha",
		screen: "overview",
		lang: "en",
		theme: "system",
		busy: false,
		generation: 1,
		selection: undefined,
		hits: [],
		query: "",
		kind: "",
		since: "",
		limit: "10",
		searchScope: null,
		reviewKind: "",
		job: undefined,
		jobError: "",
		status: { text: "", error: false },
		dialog: null,
		...patch,
	};
}
// #endregion FUNC_stateOf

// #region FUNC_apiOf
/**
 * @purpose Build one console api from a fixed state and the English message table.
 * @invariants The api gives the actions that the screens call. It holds no transport.
 */
function apiOf(state: ConsoleState): ConsoleApi {
	const call = {
		reset: () => Promise.resolve(),
		openTarget: () => Promise.resolve(),
		openCatalog: () => Promise.resolve(),
		openScopeTree: () => Promise.resolve(),
	} as unknown as ConsoleActions;
	return { state, subscribe: () => () => {}, t: english, call };
}
// #endregion FUNC_apiOf

// #region FUNC_fakeContext
/**
 * @purpose Build one client context with a fake slot service and a fake locale service.
 * @param refuse - True gives a locale service that refuses each registration.
 * @invariants The fake keeps the registered dictionaries, so a test reads the registered texts.
 */
function fakeContext(refuse = false): {
	ctx: ClientContext;
	options: SlotRegistration[];
	dictionaries: Map<string, Record<string, Record<string, string>>>;
} {
	const options: SlotRegistration[] = [];
	const dictionaries = new Map<
		string,
		Record<string, Record<string, string>>
	>();
	const locale: LocaleService = {
		register(namespace, all) {
			if (refuse) throw new Error("The namespace is taken.");
			dictionaries.set(
				namespace,
				all as Record<string, Record<string, string>>,
			);
			return () => {};
		},
		bind(namespace) {
			const all = dictionaries.get(namespace);
			return (key, values = {}) => fill(all?.en?.[key] ?? key, values);
		},
	};
	return {
		ctx: {
			slots: {
				inject: (_key, callback) => callback(),
				register: (value: SlotRegistration, _component) => {
					options.push(value);
					return () => {};
				},
			},
			locale,
			effect: (setup) => setup(),
		},
		options,
		dictionaries,
	};
}
// #endregion FUNC_fakeContext

// #region FUNC_respond
/**
 * @purpose Put one fake fetch on the global scope and collect the request URLs.
 * @param value - The JSON answer of each request.
 */
function respond(value: unknown): { urls: string[]; bodies: string[] } {
	const urls: string[] = [];
	const bodies: string[] = [];
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string, init?: { body?: string }) => {
			urls.push(url);
			if (init?.body !== undefined) bodies.push(init.body);
			return {
				ok: true,
				status: 200,
				text: async () => JSON.stringify(value),
			} as unknown as Response;
		}),
	);
	return { urls, bodies };
}
// #endregion FUNC_respond

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("tab registration", () => {
	it("registers one entry of the conversation view slot", () => {
		const { ctx, options } = fakeContext();
		apply(ctx);
		expect(options.length).toBe(1);
		const entry = options[0];
		expect(entry?.name).toBe("conversation.view");
		expect(entry?.id).toBe("memlens");
		expect(entry?.order).toBe(20);
		expect(entry?.locale).toBe(NS);
		expect(typeof entry?.label).toBe("function");
	});

	it("gives the session id and the translate function to the tab", () => {
		const { ctx, options } = fakeContext();
		apply(ctx);
		const props = options[0]?.inject("session-1") as {
			sessionId: string;
			t: Translate;
		};
		expect(props.sessionId).toBe("session-1");
		expect(props.t("nav0")).toBe("Overview");
		expect(props.t("lines", { used: 1, limit: 10 })).toBe("1 / 10 lines");
	});

	it("registers the eight dictionaries under one namespace", () => {
		const { ctx, dictionaries } = fakeContext();
		apply(ctx);
		const all = dictionaries.get(NS);
		expect(Object.keys(all ?? {}).sort()).toEqual([
			"de",
			"en",
			"es",
			"fr",
			"ja",
			"pt",
			"ru",
			"zh",
		]);
		expect(all?.en?.[TAB_KEY]).toBe("Memory");
		expect(all?.ru?.[TAB_KEY]).toBe("Память");
		expect(all?.zh?.nav0).toBeTruthy();
	});

	it("gives the tab name of the active language", () => {
		const { ctx, options } = fakeContext();
		apply(ctx);
		const label = options[0]?.label as () => string;
		expect(label()).toBe("Memory");
	});

	it("keeps the English text when the locale service refuses the registration", () => {
		const { ctx, options } = fakeContext(true);
		apply(ctx);
		const label = options[0]?.label as () => string;
		expect(label()).toBe("Memory");
		const props = options[0]?.inject("session-1") as { t: Translate };
		expect(props.t("nav0")).toBe("Overview");
		expect(props.t("lines", { used: 2, limit: 5 })).toBe("2 / 5 lines");
	});
});

describe("tab console", () => {
	it("sends the session id on each read of the plugin route", async () => {
		const { urls } = respond(viewOf());
		const api = createTabConsole("session-1", english);
		await api.call.restore(DEFAULT_ROUTE);
		expect(urls.length).toBeGreaterThan(0);
		for (const url of urls) {
			expect(url.startsWith("/plugins/memlens/")).toBe(true);
			expect(url).toContain("session=session-1");
		}
		expect(urls[0]).toContain("/plugins/memlens/view?");
	});

	it("posts the action with the session in its query and its fields in its body", async () => {
		const { urls, bodies } = respond({});
		const api = createTabConsole("session-1", english);
		await api.call.action("review", { target: "project:alpha#1" });
		expect(urls[0]).toBe("/plugins/memlens/action?session=session-1");
		expect(JSON.parse(bodies[0] ?? "{}")).toEqual({
			profile: "",
			scope: "",
			target: "project:alpha#1",
			action: "review",
		});
	});

	it("restores the place without a page address", async () => {
		respond(viewOf());
		const api = createTabConsole("session-1", english);
		await api.call.restore(DEFAULT_ROUTE);
		expect(api.state.model?.scope).toBe("project:alpha");
		expect(api.state.screen).toBe("overview");
		expect(api.state.status.text).toBe("");
	});
});

describe("tab body", () => {
	it("draws the bar, the seven screen names, and the stylesheet", () => {
		const markup = renderToStaticMarkup(
			<MemoryView sessionId="session-1" t={english} />,
		);
		expect(markup).toContain('class="ml-tab"');
		expect(markup).toContain('<span class="ml-bar-title">Screens</span>');
		expect(markup).toContain('class="ml-screen on"');
		for (const key of ["Overview", "Tree", "Catalog", "Search", "Review"])
			expect(markup).toContain(`>${key}</button>`);
		expect(markup).toContain(">Proposals</button>");
		expect(markup).toContain(">Maintenance</button>");
		expect(markup).toContain('role="status"');
		expect(markup).toContain('<div class="ml-body">');
		expect(markup).toContain("--dsw-alias-bg-base");
	});

	it("holds no scope list before the view arrives", () => {
		const markup = renderToStaticMarkup(
			<MemoryView sessionId="session-1" t={english} />,
		);
		expect(markup).not.toContain('class="ml-scopes"');
	});
});

describe("screen registry", () => {
	it("holds one component for each screen name", () => {
		expect(Object.keys(SCREEN_COMPONENTS).sort()).toEqual([...SCREENS].sort());
	});

	for (const screen of SCREENS) {
		it(`renders the ${screen} screen`, () => {
			const Screen = SCREEN_COMPONENTS[screen] as ComponentType<{
				api: ConsoleApi;
			}>;
			const markup = renderToStaticMarkup(
				<Screen api={apiOf(stateOf({ screen }))} />,
			);
			expect(typeof markup).toBe("string");
			expect(markup.length).toBeGreaterThan(0);
			expect(markup).not.toContain("undefined");
		});
	}
});

describe("tab stylesheet", () => {
	it("keeps every selector under the tab root", () => {
		const selectors = TAB_CSS.split("\n")
			.map((line) => line.trim())
			.filter((line) => line.endsWith("{") || line.endsWith(","))
			.filter((line) => !line.startsWith("@"));
		expect(selectors.length).toBeGreaterThan(40);
		for (const selector of selectors)
			expect(selector.startsWith(".ml-tab")).toBe(true);
	});

	it("holds no literal colour", () => {
		expect(TAB_CSS).not.toMatch(/#[0-9a-f]{3,8}\b/i);
		expect(TAB_CSS).not.toMatch(/\b(rgb|rgba|hsl|hsla)\(/i);
	});

	it("reaches no page element", () => {
		expect(TAB_CSS).not.toMatch(/(^|[\s,{])(:root|html|body|\*)/m);
	});
});

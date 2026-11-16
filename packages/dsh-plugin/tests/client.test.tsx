/**
 * #region moduleContract
 * @purpose Guard the two memory surfaces against a lost surface identity, a lost locale fallback, a
 *   broken screen registry, and a lost Remote, so the page and the tab draw inside the harness
 *   page.
 * @scope The panel row, the page registration, the tab registration, the locale dictionaries and
 *   their fallback, the two console ports, the Remote mount, the bodies, the screen registry, and
 *   the stylesheet rules.
 * NOT: the host service and the built artifact.
 * @invariants Each test renders from a fake namespace or a fake console API. No host call leaves the
 * test.
 * @dependencies USES: the client entry, the tab body, the screen registry, the message table, and
 * the server renderer of the console package.
 * @keywords test, client, tab, session, locale, fallback, screen, style, remote
 * #endregion moduleContract
 */

import { createRequire } from "node:module";
import type { ComponentType, ReactNode } from "react";
import { describe, expect, it } from "vitest";
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
import {
	createProfileConsole,
	createSessionConsole,
	mountConsole,
} from "../src/client/console.js";
import type {
	ClientContext,
	LocaleService,
	RemoteNamespace,
	SlotRegistration,
} from "../src/client/context.js";
import { apply, inject } from "../src/client/index.js";
import { NS, PANEL_KEY, TAB_KEY } from "../src/client/locales.js";
import { MemoryPage } from "../src/client/page.js";
import { CONSOLE_CSS } from "../src/client/styles.js";
import { MemoryView } from "../src/client/view.js";

/** The renderer of the console package. The plugin holds no react-dom of its own. */
const requireUi = createRequire(import.meta.url);
const { renderToStaticMarkup } = requireUi(
	"../../ui/node_modules/react-dom/server.js",
) as { renderToStaticMarkup: (node: ReactNode) => string };

/** The English text function of the test. */
const english: Translate = (key, values = {}) =>
	fill(messages("en")[key] ?? "", values);

/** The six methods of the console namespace. */
const METHODS = [
	"view",
	"search",
	"open",
	"catalog",
	"status",
	"action",
] as const;

/** One recorded call of the fake namespace. */
interface Call {
	readonly method: string;
	readonly input: Record<string, unknown>;
}

/** One fake namespace with its recorded calls and its optional refusals. */
interface FakeRemote {
	readonly namespace: RemoteNamespace;
	readonly calls: Call[];
	readonly mounted: { count: number; disposed: boolean };
	injectDisposed: boolean;
}

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

// #region FUNC_fakeRemote
/**
 * @purpose Build one fake namespace that records each call and answers with a fixed value.
 * @param refuse - A message per method name; a refused method returns the false branch.
 * @invariants The view answer holds the fixed view. The status answer holds one saved snapshot.
 */
function fakeRemote(refuse: Record<string, string> = {}): FakeRemote {
	const calls: Call[] = [];
	const mounted = { count: 0, disposed: false };
	const namespace = Object.fromEntries(
		METHODS.map((method) => [
			method,
			async (input: object) => {
				calls.push({ method, input: input as Record<string, unknown> });
				const message = refuse[method];
				if (message !== undefined) {
					return { ok: false, error: { code: "memlens/refused", message } };
				}
				return { ok: true, value: answerOf(method) };
			},
		]),
	) as RemoteNamespace;
	return { namespace, calls, mounted, injectDisposed: false };
}
// #endregion FUNC_fakeRemote

// #region FUNC_answerOf
/**
 * @purpose Give the fixed answer of one method.
 * @param method - The name of the console method.
 */
function answerOf(method: string): unknown {
	if (method === "view") return viewOf();
	if (method === "status") {
		return {
			session: "session-1",
			snapshot: {
				saved: true,
				chars: 12,
				materializedAt: "2026-11-01T00:00:00Z",
				nextTrigger: "2026-11-02T00:00:00Z",
				nextRefreshAt: null,
			},
			compaction: {
				attempts: 1,
				active: 0,
				backoff: 5,
				failures: 0,
				dirty: 0,
				provider: "stub",
				model: "stub-model",
				lastRunAt: null,
				nextRunAt: "2026-11-02T00:00:00Z",
				lastError: null,
			},
		};
	}
	if (method === "action") return { changed: 1 };
	return [];
}
// #endregion FUNC_answerOf

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
 * @purpose Build one client context with a fake slot service, a fake locale service, and one fake
 *   Remote namespace.
 * @param remote - The fake namespace of the test. The default name is `session-1`.
 * @param refuse - True gives a locale service that refuses each registration.
 * @invariants The fake keeps the registered dictionaries, so a test reads the registered texts.
 * @invariants The fake mount answers the fake namespace through the inject callback.
 * @invariants The fake keeps its disposers, so a test withdraws the mount.
 */
function fakeContext(
	remote = fakeRemote(),
	refuse = false,
): {
	ctx: ClientContext;
	options: SlotRegistration[];
	dictionaries: Map<string, Record<string, Record<string, string>>>;
	dispose(): void;
} {
	const options: SlotRegistration[] = [];
	const dictionaries = new Map<
		string,
		Record<string, Record<string, string>>
	>();
	const disposers: Array<() => void> = [];
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
			remote: {
				$mount: async () => {
					remote.mounted.count += 1;
					return () => {
						remote.mounted.disposed = true;
					};
				},
			},
			inject: (_keys, callback) => {
				const undo = callback({ remote: { memlens: remote.namespace } });
				return {
					dispose: () => {
						remote.injectDisposed = true;
						if (typeof undo === "function") undo();
					},
				};
			},
			effect: (setup) => {
				const disposer = setup();
				if (disposer !== undefined) disposers.push(disposer);
				return () => {};
			},
		},
		options,
		dictionaries,
		dispose: () => {
			for (const disposer of disposers) disposer();
		},
	};
}
// #endregion FUNC_fakeContext

describe("surface registration", () => {
	it("registers a row of the left side panel for the memory page", () => {
		const { ctx, options } = fakeContext();
		apply(ctx);
		const row = options.find((entry) => entry.name === "sidebar.panellist");
		expect(row?.id).toBe("memlens");
		expect(row?.order).toBe(15);
		expect(row?.locale).toBe(NS);
		expect(typeof row?.label).toBe("function");
		expect(row?.inject).toBeUndefined();
	});

	it("registers the page in the main slot under the panel id", () => {
		const { ctx, options } = fakeContext();
		apply(ctx);
		const page = options.find((entry) => entry.name === "main");
		expect(page?.key).toBe("memlens");
		expect(page?.id).toBeUndefined();
	});

	it("gives the page the translate function and the panel name", () => {
		const { ctx, options } = fakeContext();
		apply(ctx);
		const page = options.find((entry) => entry.name === "main");
		const props = page?.inject?.("") as { t: Translate; title: string };
		expect(props.title).toBe("Memory");
		expect(props.t("nav0")).toBe("Overview");
		expect(props.t("lines", { used: 1, limit: 10 })).toBe("1 / 10 lines");
	});

	it("registers the state tab in the conversation view slot", () => {
		const { ctx, options } = fakeContext();
		apply(ctx);
		const tab = options.find((entry) => entry.name === "conversation.view");
		expect(tab?.id).toBe("memlens");
		expect(tab?.order).toBe(20);
		expect(typeof tab?.label).toBe("function");
		const props = tab?.inject?.("session-1") as {
			sessionId: string;
			t: Translate;
			title: string;
		};
		expect(props.sessionId).toBe("session-1");
		expect(props.title).toBe("Memory");
		expect(props.t("nav0")).toBe("Overview");
	});

	it("declares the slot service, the locale service, and the Remote service", () => {
		expect(inject).toEqual(["slots", "locale", "remote"]);
	});

	it("registers the eight dictionaries with the panel name and the tab name", () => {
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
		expect(all?.en?.[PANEL_KEY]).toBe("Memory");
		expect(all?.ru?.[PANEL_KEY]).toBe("Память");
		expect(all?.en?.[TAB_KEY]).toBe("Memory");
		expect(all?.ru?.[TAB_KEY]).toBe("Память");
		expect(all?.zh?.nav0).toBeTruthy();
	});

	it("keeps the English text when the locale service refuses the registration", () => {
		const { ctx, options } = fakeContext(fakeRemote(), true);
		apply(ctx);
		const row = options.find((entry) => entry.name === "sidebar.panellist");
		const label = row?.label as () => string;
		expect(label()).toBe("Memory");
		const tab = options.find((entry) => entry.name === "conversation.view");
		const props = tab?.inject?.("session-1") as { t: Translate };
		expect(props.t("nav0")).toBe("Overview");
		expect(props.t("lines", { used: 2, limit: 5 })).toBe("2 / 5 lines");
	});
});

describe("Remote mount", () => {
	it("mounts the contribution once and injects the memlens namespace", () => {
		const remote = fakeRemote();
		const { ctx } = fakeContext(remote);
		apply(ctx);
		expect(remote.mounted.count).toBe(1);
	});

	it("withdraws the namespace and the contribution with the plugin", async () => {
		const remote = fakeRemote();
		const { ctx, dispose } = fakeContext(remote);
		apply(ctx);
		await Promise.resolve();
		await Promise.resolve();
		dispose();
		expect(remote.injectDisposed).toBe(true);
		expect(remote.mounted.disposed).toBe(true);
	});

	it("withdraws the contribution when the plugin dies before the mount settles", async () => {
		const remote = fakeRemote();
		const { ctx, dispose } = fakeContext(remote);
		apply(ctx);
		dispose();
		await Promise.resolve();
		await Promise.resolve();
		expect(remote.mounted.disposed).toBe(true);
	});

	it("settles a read that waits for the mount when the plugin dies", async () => {
		const remote = fakeRemote();
		const { ctx, dispose } = fakeContext(remote);
		ctx.remote.$mount = () => new Promise(() => {});
		apply(ctx);
		const api = createSessionConsole("session-1", english);
		const pending = api.call.restore(DEFAULT_ROUTE);
		dispose();
		await pending;
		expect(api.state.status.error).toBe(true);
		expect(api.state.status.text).toBe("The memory transport is not ready.");
	});

	it("keeps the namespace of a newer mount when an older mount dies", async () => {
		const first = fakeRemote();
		const second = fakeRemote();
		const one = fakeContext(first);
		const two = fakeContext(second);
		apply(one.ctx);
		apply(two.ctx);
		await Promise.resolve();
		await Promise.resolve();
		one.dispose();
		const api = createSessionConsole("session-1", english);
		await api.call.restore(DEFAULT_ROUTE);
		expect(api.state.status.error).toBe(false);
		expect(second.calls.length).toBeGreaterThan(0);
		expect(first.calls.length).toBe(0);
	});

	it("fails a call that waits on a replaced mount", async () => {
		const first = fakeRemote();
		const second = fakeRemote();
		const one = fakeContext(first);
		const two = fakeContext(second);
		one.ctx.remote.$mount = () => new Promise(() => {});
		apply(one.ctx);
		const api = createSessionConsole("session-1", english);
		const pending = api.call.action("review", { target: "project:alpha#1" });
		apply(two.ctx);
		await pending;
		expect(api.state.status.error).toBe(true);
		expect(api.state.status.text).toBe("The memory transport is not ready.");
		expect(second.calls.length).toBe(0);
	});

	it("keeps the namespace when two mounts share one facade object", async () => {
		const shared = fakeRemote();
		const one = fakeContext(shared);
		const two = fakeContext(shared);
		apply(one.ctx);
		apply(two.ctx);
		await Promise.resolve();
		await Promise.resolve();
		one.dispose();
		const api = createSessionConsole("session-1", english);
		await api.call.restore(DEFAULT_ROUTE);
		expect(api.state.status.error).toBe(false);
		expect(shared.calls.length).toBeGreaterThan(0);
	});

	it("does not use the namespace of a replaced mount", async () => {
		const first = fakeRemote();
		const second = fakeRemote();
		const one = fakeContext(first);
		const two = fakeContext(second);
		apply(one.ctx);
		await Promise.resolve();
		await Promise.resolve();
		const api = createSessionConsole("session-1", english);
		const pending = api.call.action("review", { target: "project:alpha#1" });
		apply(two.ctx);
		await pending;
		expect(first.calls.length).toBe(0);
		expect(second.calls.length).toBe(0);
		expect(api.state.status.text).toBe("The memory transport is not ready.");
	});

	it("keeps the newer namespace when an older injection is withdrawn", async () => {
		const first = fakeRemote();
		const second = fakeRemote();
		let install:
			| ((scope: { remote: Record<string, RemoteNamespace> }) => unknown)
			| undefined;
		const undo: Array<() => void> = [];
		const { ctx } = fakeContext(first);
		ctx.inject = (_keys, callback) => {
			install = callback;
			const again = callback({ remote: { memlens: first.namespace } });
			if (typeof again === "function") undo.push(again as () => void);
			return { dispose: () => {} };
		};
		apply(ctx);
		await Promise.resolve();
		await Promise.resolve();
		install?.({ remote: { memlens: second.namespace } });
		undo[0]?.();
		const api = createSessionConsole("session-1", english);
		await api.call.restore(DEFAULT_ROUTE);
		expect(second.calls.length).toBeGreaterThan(0);
		expect(first.calls.length).toBe(0);
	});

	it("reports each call when the mount fails", async () => {
		const { ctx } = fakeContext();
		ctx.remote.$mount = () => Promise.reject(new Error("no Remote"));
		mountConsole(ctx);
		const api = createSessionConsole("session-1", english);
		await api.call.restore(DEFAULT_ROUTE);
		expect(api.state.status.error).toBe(true);
		expect(api.state.status.text).toBe("The memory transport is not ready.");
	});
});

describe("session console", () => {
	it("sends the session id in each input of the Remote", async () => {
		const remote = fakeRemote();
		const { ctx } = fakeContext(remote);
		apply(ctx);
		const api = createSessionConsole("session-1", english);
		await api.call.restore(DEFAULT_ROUTE);
		expect(remote.calls.length).toBeGreaterThan(0);
		expect(remote.calls[0]?.method).toBe("view");
		for (const call of remote.calls) {
			expect(call.input.session).toBe("session-1");
		}
		expect(remote.calls[0]?.input).toEqual({
			session: "session-1",
			scope: "",
			kind: "",
		});
		expect(remote.calls.some((call) => call.method === "status")).toBe(true);
	});

	it("reads the runtime state of the session", async () => {
		const remote = fakeRemote();
		const { ctx } = fakeContext(remote);
		apply(ctx);
		const api = createSessionConsole("session-1", english);
		await api.call.restore(DEFAULT_ROUTE);
		expect(api.state.runtime?.session).toBe("session-1");
		expect(api.state.runtime?.snapshotSaved).toBe(true);
		expect(api.state.runtime?.compaction?.backoffMs).toBe(5000);
	});

	it("sends the action with the session and the fields of the controller", async () => {
		const remote = fakeRemote();
		const { ctx } = fakeContext(remote);
		apply(ctx);
		const api = createSessionConsole("session-1", english);
		await api.call.action("review", { target: "project:alpha#1" });
		const action = remote.calls.find((call) => call.method === "action");
		expect(action?.input).toEqual({
			session: "session-1",
			profile: "",
			scope: "",
			target: "project:alpha#1",
			action: "review",
		});
	});

	it("shows the cause text of a refused call", async () => {
		const remote = fakeRemote({ view: "The store is locked." });
		const { ctx } = fakeContext(remote);
		apply(ctx);
		const api = createSessionConsole("session-1", english);
		await api.call.restore(DEFAULT_ROUTE);
		expect(api.state.status.error).toBe(true);
		expect(api.state.status.text).toBe("The store is locked.");
	});

	it("restores the place without a page address", async () => {
		const remote = fakeRemote();
		const { ctx } = fakeContext(remote);
		apply(ctx);
		const api = createSessionConsole("session-1", english);
		await api.call.restore(DEFAULT_ROUTE);
		expect(api.state.model?.scope).toBe("project:alpha");
		expect(api.state.screen).toBe("overview");
		expect(api.state.status.text).toBe("");
	});
});

describe("profile console", () => {
	it("sends the profile of the request and no session", async () => {
		const remote = fakeRemote();
		const { ctx } = fakeContext(remote);
		apply(ctx);
		const api = createProfileConsole(english);
		await api.call.restore(DEFAULT_ROUTE);
		expect(remote.calls[0]?.method).toBe("view");
		expect(remote.calls[0]?.input).toEqual({
			profile: "",
			scope: "",
			kind: "",
		});
		for (const call of remote.calls)
			expect(call.input).not.toHaveProperty("session");
		expect(remote.calls.some((call) => call.method === "status")).toBe(true);
	});

	it("asks for each profile that the page selects", async () => {
		const remote = fakeRemote();
		const { ctx } = fakeContext(remote);
		apply(ctx);
		const api = createProfileConsole(english);
		await api.call.restore(DEFAULT_ROUTE);
		await api.call.setProfile("work");
		const views = remote.calls.filter((call) => call.method === "view");
		expect(views.at(-1)?.input.profile).toBe("work");
	});

	it("reads the compaction state of the host", async () => {
		const remote = fakeRemote();
		const { ctx } = fakeContext(remote);
		apply(ctx);
		const api = createProfileConsole(english);
		await api.call.restore(DEFAULT_ROUTE);
		expect(api.state.runtime?.compaction?.backoffMs).toBe(5000);
	});

	it("keeps the runtime fields absent when the host gives no snapshot", async () => {
		const base = fakeRemote();
		const remote: FakeRemote = {
			...base,
			namespace: {
				...base.namespace,
				status: async () => ({
					ok: true,
					value: {
						scope: "project:alpha",
						compaction: {
							attempts: 0,
							active: 0,
							backoff: 5,
							failures: 0,
							dirty: 1,
							provider: "stub",
							model: "stub-model",
							lastRunAt: null,
							nextRunAt: null,
							lastError: null,
						},
					},
				}),
			},
		};
		const { ctx } = fakeContext(remote);
		apply(ctx);
		const api = createProfileConsole(english);
		await api.call.restore(DEFAULT_ROUTE);
		expect(api.state.runtime?.session).toBeUndefined();
		expect(api.state.runtime?.snapshotSaved).toBeUndefined();
		expect(api.state.runtime?.compaction?.attempts).toBe(0);
		expect(api.state.status.error).toBe(false);
	});
});

describe("tab body", () => {
	it("draws the state head, the stylesheet, and no screen control", () => {
		const markup = renderToStaticMarkup(
			<MemoryView sessionId="session-1" t={english} title="Memory" />,
		);
		expect(markup).toContain('class="ml-console ml-session"');
		expect(markup).toContain('<span class="ml-title">Memory</span>');
		expect(markup).toContain('role="status"');
		expect(markup).toContain("--dsw-alias-bg-base");
		expect(markup).not.toContain('<button class="ml-screen');
		expect(markup).not.toContain('<div class="ml-body">');
	});

	it("holds no scope list before the view arrives", () => {
		const markup = renderToStaticMarkup(
			<MemoryView sessionId="session-1" t={english} title="Memory" />,
		);
		expect(markup).not.toContain('class="ml-scopelist"');
	});
});

describe("page body", () => {
	it("draws the profile control, the seven screen names, and the stylesheet", () => {
		const markup = renderToStaticMarkup(
			<MemoryPage t={english} title="Memory" />,
		);
		expect(markup).toContain('class="ml-console ml-page"');
		expect(markup).toContain('<span class="ml-title">Memory</span>');
		expect(markup).toContain('class="ml-field"');
		expect(markup).toContain("<select");
		expect(markup).toContain('class="ml-screen on"');
		for (const key of ["Overview", "Tree", "Catalog", "Search", "Review"])
			expect(markup).toContain(`>${key}</button>`);
		expect(markup).toContain(">Proposals</button>");
		expect(markup).toContain(">Maintenance</button>");
		expect(markup).toContain('class="ml-new"');
		expect(markup).toContain("--dsw-alias-bg-base");
		expect(markup).toContain('role="status"');
	});

	it("holds no scope control before the view arrives", () => {
		const markup = renderToStaticMarkup(
			<MemoryPage t={english} title="Memory" />,
		);
		expect(markup).not.toContain('class="ml-field ml-scope-field"');
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

describe("console stylesheet", () => {
	it("keeps every selector under the surface root", () => {
		const selectors = CONSOLE_CSS.split("\n")
			.map((line) => line.trim())
			.filter((line) => line.endsWith("{") || line.endsWith(","))
			.filter((line) => !line.startsWith("@"));
		expect(selectors.length).toBeGreaterThan(40);
		for (const selector of selectors)
			expect(selector.startsWith(".ml-console")).toBe(true);
	});

	it("holds no literal colour", () => {
		expect(CONSOLE_CSS).not.toMatch(/#[0-9a-f]{3,8}\b/i);
		expect(CONSOLE_CSS).not.toMatch(/\b(rgb|rgba|hsl|hsla)\(/i);
	});

	it("reaches no page element", () => {
		expect(CONSOLE_CSS).not.toMatch(/(^|[\s,{])(:root|html|body|\*)/m);
	});
});

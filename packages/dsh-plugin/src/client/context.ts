/**
 * #region moduleContract
 * @purpose Name the harness client services that the memory tab uses, so the client entry compiles
 *   without a harness client package.
 * @scope The slot service and its registration options, the locale service, and the effect call.
 * NOT: the registration call, the tab body, and the host route.
 * @invariants The shapes follow the documented slot service and locale service of the harness Web
 * page at version 0.2.2-rc.3.
 * @rationale
 *  - Q: Why does the plugin not import the slot package? A: The plugin imports no harness client
 *    package at run time, and the package is absent from this workspace.
 * @keywords client, context, slot, locale, service, contract
 * #endregion moduleContract
 */

import type { ComponentType } from "react";

// #region TYPE_Message
/**
 * @purpose Give the text of one key of a locale namespace.
 * @invariants The function fills each {name} placeholder from the values that it has.
 * @invariants A missing key gives the key text, and a missing value keeps its placeholder.
 */
export type Message = (
	key: string,
	values?: Record<string, string | number>,
) => string;
// #endregion TYPE_Message

// #region INTERFACE_LocaleService
/**
 * @purpose Give the client entry the dictionaries and the translate function of the harness page.
 * @invariants The register call takes each dictionary of one namespace in one call.
 * @invariants The bind call gives one function for a namespace, and that function reads the active
 * language at call time.
 */
export interface LocaleService {
	register(
		namespace: string,
		dictionaries: Readonly<Record<string, Readonly<Record<string, string>>>>,
	): () => void;
	bind(namespace: string): Message;
}
// #endregion INTERFACE_LocaleService

// #region INTERFACE_SlotRegistration
/**
 * @purpose Give the slot service the entry name, the id, the place, the locale, the label, and the
 *   props of the entry.
 * @invariants The label is a text or a function. A function reads the active language at call time.
 * @invariants The inject function takes the session id and gives the props of the tab component.
 */
export interface SlotRegistration {
	readonly name: string;
	readonly id: string;
	readonly order: number;
	readonly locale: string;
	readonly label: string | (() => string);
	readonly inject: (sessionId: string) => object;
}
// #endregion INTERFACE_SlotRegistration

// #region INTERFACE_SlotService
/**
 * @purpose Register one tab entry for the lifetime of the slot declaration.
 * @invariants The register call takes the component that draws the entry.
 */
export interface SlotService {
	/** Run the callback for each declaration lifetime of the slot. */
	inject(key: string, callback: () => unknown): unknown;

	/** Register one entry, and return its disposer. */
	register<P>(options: SlotRegistration, component: ComponentType<P>): unknown;
}
// #endregion INTERFACE_SlotService

// #region INTERFACE_ClientContext
/**
 * @purpose Give the client entry the services that the harness provides.
 * @invariants The effect call runs the setup now and gives its disposer to the plugin lifetime.
 */
export interface ClientContext {
	readonly slots: SlotService;
	readonly locale: LocaleService;
	effect(setup: () => (() => void) | undefined, label: string): unknown;
}
// #endregion INTERFACE_ClientContext

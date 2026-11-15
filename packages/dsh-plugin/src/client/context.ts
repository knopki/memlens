/**
 * #region moduleContract
 * @purpose Name the harness client services that the memory tab uses, so the client entry compiles
 *   without a harness client package.
 * @scope The slot service and its registration options, the locale service, the effect call, the
 * Remote service, and the injected Remote namespace.
 * NOT: the registration call, the tab body, and the host service.
 * @invariants The shapes follow the documented slot service, locale service, and Remote service of
 * the harness Web page at version 0.2.2-rc.3.
 * @invariants The Remote types are structural, so the client imports no harness client package.
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
 * @purpose Give the slot service the entry name, its place, its locale, its label, and its props.
 * @invariants A list entry holds an id and an order. A keyed entry holds a key.
 * @invariants The label is a text or a function. A function reads the active language at call time.
 * @invariants The inject function takes the session id and gives the props of the surface
 *   component. A keyed entry without a session holds no inject function.
 */
export interface SlotRegistration {
	readonly name: string;
	readonly id?: string;
	readonly key?: string;
	readonly order?: number;
	readonly locale?: string;
	readonly label?: string | (() => string);
	readonly inject?: (sessionId: string) => object;
}
// #endregion INTERFACE_SlotRegistration

// #region INTERFACE_SlotService
/**
 * @purpose Register one entry for the lifetime of the slot declaration.
 * @invariants The register call takes the component that draws the entry.
 */
export interface SlotService {
	/** Run the callback for each declaration lifetime of the slot. */
	inject(key: string, callback: () => unknown): unknown;

	/** Register one entry, and return its disposer. */
	register<P extends object>(
		options: SlotRegistration,
		component: ComponentType<P>,
	): unknown;
}
// #endregion INTERFACE_SlotService

// #region TYPE_PanelIconProps
/**
 * @purpose Hold the presentation that the sidebar gives one panel icon.
 * @invariants The size is the square edge in pixels. The active flag marks the selected panel.
 */
export type PanelIconProps = {
	readonly size: number;
	readonly active: boolean;
};
// #endregion TYPE_PanelIconProps

// #region INTERFACE_RemoteFailure
/**
 * @purpose Carry the code and the message of one failed Remote call.
 * @invariants The code names the failure kind. The message is the cause text for the status line.
 */
export interface RemoteFailure {
	readonly code?: string;
	readonly message?: string;
}
// #endregion INTERFACE_RemoteFailure

// #region TYPE_RemoteEnvelope
/**
 * @purpose Hold one Remote answer: the value of a success or the failure of a refusal.
 * @invariants The Remote face resolves every call with one of the two branches.
 */
export type RemoteEnvelope =
	| { readonly ok: true; readonly value: unknown }
	| { readonly ok: false; readonly error: RemoteFailure };
// #endregion TYPE_RemoteEnvelope

// #region TYPE_RemoteNamespace
/**
 * @purpose Give the six console methods of the mounted namespace, each one call with one object.
 * @invariants A method absent from the namespace reads as absent, so the port reports it.
 */
export type RemoteNamespace = Readonly<
	Record<string, (input: object) => Promise<RemoteEnvelope>>
>;
// #endregion TYPE_RemoteNamespace

// #region INTERFACE_RemoteContribution
/**
 * @purpose Hold the package name and the descriptors of one Remote contribution.
 * @invariants The descriptors are shape-identical to the host descriptors of the same method table.
 */
export interface RemoteContribution {
	readonly package: string;
	readonly descriptors: readonly unknown[];
}
// #endregion INTERFACE_RemoteContribution

// #region INTERFACE_Disposable
/**
 * @purpose Hold one registration that the caller withdraws.
 */
export interface Disposable {
	dispose(): unknown;
}
// #endregion INTERFACE_Disposable

// #region INTERFACE_RemoteService
/**
 * @purpose Mount one Remote contribution in the fiber of the client plugin.
 * @invariants The mount gives the disposer of the namespace, and the namespace leaves with it.
 */
export interface RemoteService {
	$mount(contribution: RemoteContribution): Promise<unknown>;
}
// #endregion INTERFACE_RemoteService

// #region INTERFACE_RemoteScope
/**
 * @purpose Hold the namespace services that one inject call gives.
 * @invariants A key of the form `remote.memlens` gives the service under `remote.memlens`.
 */
export interface RemoteScope {
	readonly remote: Readonly<Record<string, RemoteNamespace>>;
}
// #endregion INTERFACE_RemoteScope

// #region INTERFACE_ClientContext
/**
 * @purpose Give the client entry the services that the harness provides.
 * @invariants The effect call runs the setup now and gives its disposer to the plugin lifetime.
 * @invariants The inject call runs the callback when the named services exist, and gives its
 *   disposer.
 */
export interface ClientContext {
	readonly slots: SlotService;
	readonly locale: LocaleService;
	readonly remote: RemoteService;
	effect(setup: () => (() => void) | undefined, label: string): unknown;
	inject(
		keys: readonly string[],
		callback: (scope: RemoteScope) => unknown,
	): Disposable;
}
// #endregion INTERFACE_ClientContext

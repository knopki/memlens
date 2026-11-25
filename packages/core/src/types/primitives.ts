/**
 * #region moduleContract
 * @modulecontract
 * @purpose Define the shared primitive types of the store and the domain, so each module names one shape.
 * @scope The identifier, the time, the scope key, the note kind, and the console screen.
 * #endregion moduleContract
 */

/** A time-sorted identifier. */
export type Ulid = string;

/** An ISO 8601 time in UTC. */
export type IsoTime = string;

/** A scope key with two segments. */
export type ScopeKey = `${string}:${string}`;

/** The kind of a note. */
export type NoteKind =
	| "decision"
	| "preference"
	| "fact"
	| "gotcha"
	| "task"
	| "note";

/** The screen requests that both console hosts accept. */
export const CONSOLE_SCREENS = [
	"overview",
	"tree",
	"catalog",
	"search",
	"review",
	"proposals",
	"maintenance",
	"session",
] as const;

/** One console screen or the session tab. */
export type ConsoleScreen = (typeof CONSOLE_SCREENS)[number];

/** Each note kind, in the order of the configuration and the transfer text. */
export const NOTE_KINDS = [
	"decision",
	"preference",
	"fact",
	"gotcha",
	"task",
	"note",
] as const satisfies readonly NoteKind[];

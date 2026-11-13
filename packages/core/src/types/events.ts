/**
 * #region moduleContract
 * @purpose Define shared primitive types for the store and domain.
 * #endregion moduleContract
 */

/** A time-sorted identifier. */
export type Ulid = string;

/** An ISO 8601 time in UTC. */
export type IsoTime = string;

/** A scope key with two segments. */
export type ScopeKey = `${string}:${string}`;

/** The kind of a note. */
export type NoteKind = "decision" | "preference" | "fact" | "task" | "note";

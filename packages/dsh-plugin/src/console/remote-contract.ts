/**
 * #region moduleContract
 * @purpose Give both faces of the console Remote one method table, one strict schema for each
 *   input and result, and one descriptor list, so the host dispatch and the client mount cannot
 *   drift.
 * @scope
 *  - The method names, the wire input objects, the result shapes, the schema factories, and the
 *    invocation descriptors.
 *  - NOT: the service class, the registration, the client port, and the console operations.
 * @invariants Each input object is strict, so its codec rejects an unknown field.
 * @invariants Both faces read the same descriptors, so the descriptor ids and the wire names are
 *   equal.
 * @invariants The wire carries a text field as text, so the console operations keep their rules.
 * @invariants The wire input of each method holds the surface identity, because the transport
 *   carries no query string.
 * @usecases
 *  - Mount: client => mounts the contribution => gets `remote.memlens` with six methods
 * @dependencies USES API: @deepseek-ai/dsh-typert-protocol, zod
 * @keywords remote, typert, descriptor, schema, strict, console, method, table
 * #endregion moduleContract
 */

import type {
	InvocationDescriptor,
	TypertCodec,
	TypertRemoteContribution,
} from "@deepseek-ai/dsh-typert-protocol";
import { NOTE_KINDS } from "@memlens/core/view";
import { z } from "zod";

/** The npm package that owns the console methods. */
export const CONSOLE_PACKAGE = "@memlens/dsh-plugin";

/** The Cordis service key of the console Remote service. The memory service holds `memlens`. */
export const CONSOLE_SERVICE = "memlensRemote";

/** The wire namespace of the console methods. */
export const CONSOLE_NAMESPACE = "memlens";

/** The name of the one wire parameter of each method. */
const INPUT = "input";

/** The note kinds of the store. */
const noteKind = z.enum(NOTE_KINDS);

/** A note kind or the empty text that the console sends when no kind narrows the read. */
const anyKind = z.union([noteKind, z.literal("")]);

/** A scope key. The console operations check the key against the profile of the request. */
const scopeKey = z.string();

/** One range of positions of a store tree. */
const range = z.strictObject({
	start: z.number(),
	level: z.number(),
});

/** The values of one non-empty child of a build input. */
const buildChild = z.discriminatedUnion("kind", [
	z.strictObject({
		kind: z.literal("record"),
		id: z.string(),
		pos: z.number(),
		body: z.string(),
		preview: z.string(),
		ts: z.string(),
	}),
	z.strictObject({
		kind: z.literal("node"),
		id: z.string(),
		range,
		summary: z.string(),
		ts_from: z.string(),
		ts_to: z.string(),
		pos: z.number().optional(),
	}),
]);

/** One build input of a compaction job. A null child is an empty half. */
const buildInput = z.strictObject({
	range,
	children: z.tuple([buildChild.nullable(), buildChild.nullable()]),
});

// #region TYPE_ConsoleMethod
/** @purpose Name each console method that the host answers and the client calls. */
export type ConsoleMethod =
	| "view"
	| "search"
	| "open"
	| "catalog"
	| "status"
	| "action";
// #endregion TYPE_ConsoleMethod

/** Each console method, in the table order. */
export const CONSOLE_METHODS: readonly ConsoleMethod[] = [
	"view",
	"search",
	"open",
	"catalog",
	"status",
	"action",
];

// #region FUNC_inputs
/**
 * @purpose Give the strict wire input of each console method, so the Gateway rejects a request of
 *   another shape before the operation runs.
 * @invariants Each input names its surface: the session id of a session surface, or the profile
 *   name of a profile surface.
 * @invariants A field that the console carries as text on the wire stays text, so the operations
 *   keep their parse rules.
 */
const inputs = {
	view: z.strictObject({
		session: z.string().optional(),
		profile: z.string().optional(),
		scope: z.string().optional(),
		kind: anyKind.optional(),
	}),
	search: z.strictObject({
		session: z.string().optional(),
		profile: z.string().optional(),
		scope: z.string().optional(),
		q: z.string().optional(),
		query: z.string().optional(),
		kind: anyKind.optional(),
		since: z.string().optional(),
		limit: z.string().optional(),
	}),
	open: z.strictObject({
		session: z.string().optional(),
		profile: z.string().optional(),
		scope: z.string().optional(),
		target: z.string(),
		offset: z.string().optional(),
	}),
	catalog: z.strictObject({
		session: z.string().optional(),
		profile: z.string().optional(),
		scope: z.string().optional(),
		start: z.string(),
		level: z.string().optional(),
		budget: z.string().optional(),
	}),
	status: z.strictObject({
		session: z.string().optional(),
		profile: z.string().optional(),
		scope: z.string().optional(),
	}),
	action: z.strictObject({
		session: z.string().optional(),
		profile: z.string().optional(),
		scope: z.string().optional(),
		action: z.enum([
			"note",
			"accept",
			"dismiss",
			"amend",
			"review",
			"forget",
			"delete",
			"scope-forget",
			"scope-delete",
			"compact",
			"compact-answer",
		]),
		target: z.string().optional(),
		dest: z.string().optional(),
		body: z.string().optional(),
		longform: z.string().optional(),
		kind: anyKind.optional(),
		supersedes: z.string().optional(),
		confirm: z.boolean().optional(),
		answers: z.string().optional(),
		inputs: z.array(buildInput).optional(),
	}),
} as const;
// #endregion FUNC_inputs

// #region FUNC_results
/**
 * @purpose Give the strict result of each console method, so the host encodes only a value of the
 *   declared shape and the client decodes the same shape.
 * @invariants The view result holds the console model and the host fields of the plugin.
 * @invariants The action result is the union of the answer of each action.
 */
const proposal = z.strictObject({
	id: z.string(),
	scope: scopeKey,
	op: z.string(),
	target: z.string().nullable(),
	payload: z.string(),
	created_at: z.string(),
	expires_at: z.string(),
	status: z.enum(["open", "accepted", "dismissed", "expired"]),
});

/** One note of the review list. */
const dueRecord = z.strictObject({
	addr: z.string(),
	scope: scopeKey,
	pos: z.number(),
	ts: z.string(),
	kind: noteKind,
	body: z.string(),
	review_at: z.string().nullable(),
});

/** One line of a slice. */
const sliceLine = z.discriminatedUnion("kind", [
	z.strictObject({
		kind: z.literal("record"),
		pos: z.number(),
		from: z.string(),
		to: z.string(),
		body: z.string(),
	}),
	z.strictObject({
		kind: z.literal("summary"),
		range,
		from: z.string(),
		to: z.string(),
		summary: z.string(),
	}),
	z.strictObject({
		kind: z.literal("temporary"),
		range,
		from: z.string(),
		to: z.string(),
		text: z.string(),
	}),
]);

/** One catalog line. The catalog adds the picked range to the top line, even to a record line. */
const catalogLine = z.discriminatedUnion("kind", [
	z.strictObject({
		kind: z.literal("record"),
		pos: z.number(),
		from: z.string(),
		to: z.string(),
		body: z.string(),
		range: range.optional(),
	}),
	z.strictObject({
		kind: z.literal("summary"),
		range,
		from: z.string(),
		to: z.string(),
		summary: z.string(),
	}),
	z.strictObject({
		kind: z.literal("temporary"),
		range,
		from: z.string(),
		to: z.string(),
		text: z.string(),
	}),
]);

/** One node row of the store. */
const nodeRow = z.strictObject({
	scope: scopeKey,
	level: z.number(),
	start: z.number(),
	summary: z.string(),
	ts_from: z.string(),
	ts_to: z.string(),
	built_v: z.string(),
	a_key: z.string().nullable(),
	b_key: z.string().nullable(),
});

/** One record row of the console model. */
const recordRow = z.strictObject({
	id: z.string(),
	scope: scopeKey,
	pos: z.number(),
	order: z.string(),
	state: z.enum(["live", "hidden", "deleted"]),
	body: z.string(),
	kind: noteKind,
	ts: z.string(),
	review_at: z.string().nullable(),
	recorded_at: z.string(),
	modified_at: z.string(),
	longform: z.string().nullable(),
	refs: z.array(z.string()),
	supersedes: z.array(z.string()),
	superseded_by: z.string().nullable(),
	content_cleared: z.boolean(),
	session: z.string(),
	turn: z.string(),
	preset: z.string(),
});

/** The fields of the console model, so the view result and the model keep one shape. */
const modelFields = {
	profile: z.string(),
	scope: scopeKey,
	scopes: z.array(
		z.strictObject({
			key: scopeKey,
			total: z.number(),
			live: z.number(),
			hidden: z.number(),
			deleted: z.number(),
			frontier: z.string(),
		}),
	),
	here: z.string(),
	directions: z.string(),
	text: z.string(),
	budgets: z.strictObject({
		here: z.strictObject({ used: z.number(), limit: z.number() }),
		directions: z.strictObject({ used: z.number(), limit: z.number() }),
	}),
	records: z.array(recordRow),
	nodes: z.array(
		z.strictObject({ scope: scopeKey, node: nodeRow, clean: z.boolean() }),
	),
	candidates: z.array(
		z.strictObject({ scope: z.string(), range, ready: z.boolean() }),
	),
	catalog: z.array(catalogLine),
	catalogScopes: z.array(scopeKey),
	frontier: z.array(sliceLine),
	review: z.array(dueRecord),
	reviewNext: z.array(dueRecord),
	reviewNextTotal: z.number(),
	revision: z.string(),
} as const;

/** The answer of one action. */
const actionResult = z.union([
	z.strictObject({ id: z.string() }),
	z.strictObject({ duplicate: z.literal(true) }),
	z.strictObject({ ok: z.literal(true) }),
	z.strictObject({ changed: z.number() }),
	z.strictObject({
		inputs: z.array(buildInput),
		job: z.string(),
		copies: z.number(),
		joins: z.number(),
	}),
	z.strictObject({
		built: z.number(),
		rejected: z.number(),
		rejectedRanges: z.array(z.string()),
	}),
]);

const results = {
	view: z.strictObject({
		...modelFields,
		proposals: z.array(proposal),
		profiles: z.array(z.string()),
		path: z.string(),
		backend: z.string(),
		allowDelete: z.boolean(),
		reviewPolicy: z.record(noteKind, z.number()),
	}),
	search: z.array(
		z.strictObject({
			addr: z.string(),
			scope: scopeKey,
			pos: z.number(),
			id: z.string(),
			ts: z.string(),
			kind: noteKind,
			body: z.string(),
			longformChars: z.number(),
			review_at: z.string().nullable(),
		}),
	),
	open: z.discriminatedUnion("kind", [
		z.strictObject({
			kind: z.literal("entry"),
			addr: z.string(),
			pos: z.number(),
			id: z.string(),
			ts: z.string(),
			scope: scopeKey,
			body: z.string(),
			longform: z.string().optional(),
			longformChars: z.number(),
			longformOffset: z.number(),
			longformTruncated: z.boolean(),
			review_at: z.string().nullable(),
			modified_at: z.string(),
			refs: z.array(z.string()),
		}),
		z.strictObject({
			kind: z.literal("children"),
			children: z.array(
				z.strictObject({
					addr: z.string(),
					ts_from: z.string(),
					ts_to: z.string(),
					text: z.string(),
					built: z.boolean(),
					chars: z.number(),
				}),
			),
		}),
	]),
	catalog: z.array(catalogLine),
	status: z.strictObject({
		session: z.string().optional(),
		scope: scopeKey,
		snapshot: z
			.strictObject({
				saved: z.boolean(),
				chars: z.number(),
				materializedAt: z.string().nullable(),
			})
			.optional(),
		store: z
			.strictObject({
				ready: z.boolean(),
				error: z.string().nullable(),
			})
			.optional(),
		compaction: z
			.strictObject({
				attempts: z.number(),
				active: z.number(),
				backoff: z.number(),
				failures: z.number(),
				dirty: z.number(),
				provider: z.string(),
				model: z.string(),
				lastRunAt: z.string().nullable(),
				nextRunAt: z.string().nullable(),
				lastError: z.string().nullable(),
				events: z.array(
					z.strictObject({
						at: z.string(),
						kind: z.enum(["pass", "call", "retry", "error"]),
						text: z.string(),
					}),
				),
			})
			.optional(),
	}),
	action: actionResult,
} as const;
// #endregion FUNC_results

// #region TYPE_ConsoleInputs
/** @purpose Give the host and the client the exact wire input of each console method. */
export type ConsoleInputs = {
	readonly [M in ConsoleMethod]: z.infer<(typeof inputs)[M]>;
};
// #endregion TYPE_ConsoleInputs

// #region TYPE_ConsoleResults
/** @purpose Give the host and the client the exact result of each console method. */
export type ConsoleResults = {
	readonly [M in ConsoleMethod]: z.infer<(typeof results)[M]>;
};
// #endregion TYPE_ConsoleResults

// #region TYPE_ConsoleSchemas
/** @purpose Give the host one input schema for each console method. */
export type ConsoleSchemas = {
	readonly [M in ConsoleMethod]: z.ZodType<ConsoleInputs[M]>;
};
// #endregion TYPE_ConsoleSchemas

// #region CONST_consoleSchemas
/** The strict input schema of each console method, by method name. */
export const consoleSchemas: ConsoleSchemas = inputs;
// #endregion CONST_consoleSchemas

// #region CONST_consoleResultSchemas
/** The strict result schema of each console method, by method name. */
export const consoleResultSchemas: {
	readonly [M in ConsoleMethod]: z.ZodType<ConsoleResults[M]>;
} = results;
// #endregion CONST_consoleResultSchemas

// #region FUNC_inputCodec
/**
 * @purpose Decode one wire input through its strict schema, so the Gateway rejects an unknown
 *   field with `gateway/input-invalid` before the operation runs.
 * @param method - The console method of the codec.
 * @param schema - The strict input schema of that method.
 */
function inputCodec(method: ConsoleMethod, schema: z.ZodType): TypertCodec {
	return {
		mode: "strict",
		typeSymbol: `${CONSOLE_NAMESPACE}.${method}.input`,
		create: () => schema,
	};
}
// #endregion FUNC_inputCodec

// #region FUNC_resultCodec
/**
 * @purpose Validate one result at both faces, so a drifted shape fails as a Remote error and not
 *   as a broken screen.
 * @invariants The Gateway encodes through `encode`, and the client decodes through `decode`.
 * @param method - The console method of the codec.
 * @param schema - The strict result schema of that method.
 */
function resultCodec(method: ConsoleMethod, schema: z.ZodType): TypertCodec {
	const parse = (value: unknown): unknown => schema.parse(value);
	return {
		mode: "strict",
		typeSymbol: `${CONSOLE_NAMESPACE}.${method}.result`,
		create: () => schema,
		decode: parse,
		encode: (value) => parse(value),
	};
}
// #endregion FUNC_resultCodec

// #region FUNC_consoleDescriptors
/**
 * @purpose Give the one descriptor list of the console, so the host dispatch and the client mount
 *   read the same ids and the same wire names.
 * @invariants Each method takes one input object on the wire field `input`.
 * @invariants The descriptor id is `<package>#<namespace>/<method>`.
 */
export function consoleDescriptors(): readonly InvocationDescriptor[] {
	return CONSOLE_METHODS.map((method) => ({
		id: `${CONSOLE_PACKAGE}#${CONSOLE_NAMESPACE}/${method}`,
		service: CONSOLE_SERVICE,
		namespace: CONSOLE_NAMESPACE,
		method,
		invocation: { kind: "direct" as const },
		parameters: [
			{
				name: INPUT,
				wire: INPUT,
				source: "json" as const,
				codec: inputCodec(method, inputs[method]),
			},
		],
		result: resultCodec(method, results[method]),
	}));
}
// #endregion FUNC_consoleDescriptors

// #region FUNC_consoleContribution
/**
 * @purpose Give the client the contribution that it mounts, built from the one descriptor list.
 */
export function consoleContribution(): TypertRemoteContribution {
	return { package: CONSOLE_PACKAGE, descriptors: consoleDescriptors() };
}
// #endregion FUNC_consoleContribution

// #region FUNC_consoleSchemaFactories
/**
 * @purpose Give the host registration the schema factories of the console, so the registry holds
 *   the one set of strict schemas.
 * @invariants Each factory materializes its schema only when a reader calls `create`.
 */
export function consoleSchemaFactories(): readonly {
	readonly name: string;
	readonly create: () => z.ZodType;
}[] {
	return CONSOLE_METHODS.flatMap((method) => [
		{ name: `console.${method}.input`, create: () => inputs[method] },
		{ name: `console.${method}.result`, create: () => results[method] },
	]);
}
// #endregion FUNC_consoleSchemaFactories

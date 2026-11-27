/**
 * #region moduleContract
 * @modulecontract
 * @purpose Check the scope key grammar, the normalization, the sanitization, the hidden key
 * test, and the concrete key test.
 * #endregion moduleContract
 */
import { describe, expect, it } from "vitest";
import {
	concreteScopeKey,
	isCatalogKey,
	normalizeScopeKey,
	sanitizeName,
	validateScopeKey,
} from "../src/domain/scope.js";

describe("normalizeScopeKey", () => {
	it("lowercases the kind and keeps the name", () => {
		expect(normalizeScopeKey("Project:DSH")).toBe("project:DSH");
	});

	it("passes through a lowercase key unchanged", () => {
		expect(normalizeScopeKey("project:dsh")).toBe("project:dsh");
	});

	it("composes the text to NFC", () => {
		expect(normalizeScopeKey("project:e\u0301")).toBe("project:é");
	});
});

describe("sanitizeName", () => {
	it("replaces each whitespace sign with an underscore", () => {
		expect(sanitizeName("my notes")).toBe("my_notes");
	});

	it("replaces hash, comma, and brackets", () => {
		expect(sanitizeName("a#b[c],d")).toBe("a_b_c__d");
	});

	it("replaces invisible signs", () => {
		expect(sanitizeName("a\u00a0b")).toBe("a_b");
		expect(sanitizeName("a\u200bb")).toBe("a_b");
	});

	it("keeps each allowed sign", () => {
		expect(sanitizeName("A.b:c/d_e-f")).toBe("A.b:c/d_e-f");
	});
});

describe("validateScopeKey", () => {
	it("accepts a valid key", () => {
		expect(validateScopeKey("project:dsh/optmem")).toBe(true);
	});

	it("accepts a key with period, underscore, slash, hyphen", () => {
		expect(validateScopeKey("my.app:data_store/main-v2")).toBe(true);
	});

	it("accepts a key that starts each segment with a digit", () => {
		expect(validateScopeKey("1project:1name")).toBe(true);
	});

	it("accepts an uppercase name", () => {
		expect(validateScopeKey("project:DSH")).toBe(true);
	});

	it("accepts a name in another script", () => {
		expect(validateScopeKey("project:котя")).toBe(true);
		expect(validateScopeKey("project:飞书")).toBe(true);
	});

	it("accepts colons and quotes in the name", () => {
		expect(validateScopeKey("project:group:sub")).toBe(true);
		expect(validateScopeKey('project:my"notes')).toBe(true);
	});

	it("accepts a name that starts with a period or a slash", () => {
		expect(validateScopeKey("project:.hidden")).toBe(true);
		expect(validateScopeKey("project:/tools")).toBe(true);
	});

	it("rejects a key with no colon", () => {
		expect(validateScopeKey("nodash")).toBe(false);
	});

	it("rejects a key with an empty kind", () => {
		expect(validateScopeKey(":name")).toBe(false);
	});

	it("rejects a key with an empty name", () => {
		expect(validateScopeKey("kind:")).toBe(false);
	});

	it("rejects an uppercase kind", () => {
		expect(validateScopeKey("Project:dsh")).toBe(false);
	});

	it("rejects a kind that starts with a period", () => {
		expect(validateScopeKey(".project:foo")).toBe(false);
	});

	it("rejects whitespace, hash, comma, and brackets in the name", () => {
		expect(validateScopeKey("project:dsh optmem")).toBe(false);
		expect(validateScopeKey("project:a#b")).toBe(false);
		expect(validateScopeKey("project:a,b")).toBe(false);
		expect(validateScopeKey("project:a[b")).toBe(false);
	});

	it("rejects invisible signs in the name", () => {
		expect(validateScopeKey("project:a\u00a0b")).toBe(false);
		expect(validateScopeKey("project:a\u200bb")).toBe(false);
	});
});

describe("isCatalogKey", () => {
	it("detects a catalog key", () => {
		expect(isCatalogKey("__catalog__:myprofile")).toBe(true);
	});

	it("rejects a normal scope key", () => {
		expect(isCatalogKey("project:dsh")).toBe(false);
	});
});

describe("concreteScopeKey", () => {
	it("accepts a valid key", () => {
		expect(concreteScopeKey("project:dsh/optmem")).toBe(true);
	});

	it("rejects a scope pattern", () => {
		expect(concreteScopeKey("user:*")).toBe(false);
		expect(concreteScopeKey("*")).toBe(false);
		expect(concreteScopeKey("project:d*sh")).toBe(false);
	});

	it("rejects an invalid key", () => {
		expect(concreteScopeKey("nodash")).toBe(false);
		expect(concreteScopeKey("kind:")).toBe(false);
	});
});

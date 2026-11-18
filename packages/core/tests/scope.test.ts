/**
 * #region moduleContract
 * @modulecontract
 * @purpose Check the scope key grammar, the normalization, and the hidden key test.
 * #endregion moduleContract
 */
import { describe, expect, it } from "vitest";
import {
	isCatalogKey,
	normalizeScopeKey,
	validateScopeKey,
} from "../src/domain/scope.js";

describe("normalizeScopeKey", () => {
	it("lowercases the key", () => {
		expect(normalizeScopeKey("Project:DSH")).toBe("project:dsh");
	});

	it("passes through a lowercase key unchanged", () => {
		expect(normalizeScopeKey("project:dsh")).toBe("project:dsh");
	});
});

describe("validateScopeKey", () => {
	it("accepts a valid key", () => {
		expect(validateScopeKey("project:dsh/optmem")).toBe(true);
	});

	it("accepts a key with period, underscore, slash, hyphen", () => {
		expect(validateScopeKey("my.app:data_store/main-v2")).toBe(true);
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

	it("rejects a key with uppercase letters", () => {
		expect(validateScopeKey("Project:dsh")).toBe(false);
	});

	it("rejects a key with spaces", () => {
		expect(validateScopeKey("project:dsh optmem")).toBe(false);
	});

	it("accepts a key that starts each segment with a digit", () => {
		expect(validateScopeKey("1project:1name")).toBe(true);
	});

	it("accepts a name that starts with a period, underscore, or hyphen", () => {
		expect(validateScopeKey("project:.hidden")).toBe(true);
		expect(validateScopeKey("project:_private")).toBe(true);
		expect(validateScopeKey("project:-dash")).toBe(true);
	});

	it("rejects a kind that starts with a period", () => {
		expect(validateScopeKey(".project:foo")).toBe(false);
	});

	it("rejects a name that starts with a slash", () => {
		expect(validateScopeKey("project:/foo")).toBe(false);
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

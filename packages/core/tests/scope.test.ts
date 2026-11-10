/**
 * Tests for scope key validation and normalization.
 */
import { describe, expect, it } from "vitest";
import {
	catalogKey,
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
});

describe("isCatalogKey", () => {
	it("detects a catalog key", () => {
		expect(isCatalogKey(catalogKey("myprofile"))).toBe(true);
	});

	it("rejects a normal scope key", () => {
		expect(isCatalogKey("project:dsh")).toBe(false);
	});
});

describe("catalogKey", () => {
	it("returns the catalog scope key for a profile", () => {
		expect(catalogKey("work")).toBe("__catalog__:work");
	});
});

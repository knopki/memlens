/**
 * #region moduleContract
 * @modulecontract
 * @purpose Check the address grammar of one record.
 * #endregion moduleContract
 */
import { describe, expect, it } from "vitest";
import { parseAddress } from "../src/domain/address.js";

describe("parseAddress", () => {
	it("parses a pos", () => {
		expect(parseAddress("42")).toEqual({
			kind: "pos",
			pos: 42,
			scope: null,
		});
	});

	it("parses a pos with a leading #", () => {
		expect(parseAddress("#42")).toEqual({
			kind: "pos",
			pos: 42,
			scope: null,
		});
	});

	it("parses a range", () => {
		expect(parseAddress("10-20")).toEqual({
			kind: "range",
			start: 10,
			end: 20,
			scope: null,
		});
	});

	it("parses a scoped pos", () => {
		expect(parseAddress("project:dsh#42")).toEqual({
			kind: "scoped-pos",
			scope: "project:dsh",
			pos: 42,
		});
	});

	it("parses a scoped range", () => {
		expect(parseAddress("project:dsh#10-20")).toEqual({
			kind: "scoped-range",
			scope: "project:dsh",
			start: 10,
			end: 20,
		});
	});

	it("rejects a range where end < start", () => {
		expect(parseAddress("20-10")).toBeNull();
	});

	it("rejects a non-numeric pos", () => {
		expect(parseAddress("abc")).toBeNull();
	});

	it("rejects a negative pos", () => {
		expect(parseAddress("-1")).toBeNull();
	});

	it("rejects an invalid scope key", () => {
		expect(parseAddress("Invalid Scope#42")).toBeNull();
	});
});

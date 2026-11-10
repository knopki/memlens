/**
 * CLI entry tests.
 *
 * #region moduleContract
 * @modulecontract
 * @purpose Verify the dispatch and the exit codes of the binary, so the usage rules hold.
 * @scope The usage errors and the exit code mapping. NOT: the command behavior.
 * @invariants An unknown command and no command give the exit code 2.
 * @keywords cli, test, usage, exit code
 * #endregion moduleContract
 */

import { describe, expect, it } from "vitest";
import { main } from "../src/cli.js";

describe("@memlens/cli entry", () => {
	it("gives the exit code 2 without a command", async () => {
		expect(await main([])).toBe(2);
	});

	it("gives the exit code 2 for an unknown command", async () => {
		expect(await main(["nope"])).toBe(2);
	});

	it("gives the exit code 2 for a flag outside the usage", async () => {
		expect(await main(["scopes", "--wrong"])).toBe(2);
	});
});

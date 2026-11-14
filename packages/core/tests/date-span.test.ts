/**
 * #region moduleContract
 * @modulecontract
 * @purpose Check the date span of a range, so a range line names its span once.
 * #endregion moduleContract
 */
import { describe, expect, it } from "vitest";
import { dateSpan } from "../src/domain/date-span.js";

describe("dateSpan", () => {
	it("writes the shared prefix once", () => {
		expect(
			dateSpan("2026-11-01T08:38:36.760Z", "2026-11-02T09:00:00.000Z"),
		).toBe("2026-11-01..02");
		expect(dateSpan("2026-11-28", "2026-12-03")).toBe("2026-11-28..12-03");
		expect(dateSpan("2026-12-30", "2027-01-02")).toBe("2026-12-30..2027-01-02");
		expect(dateSpan("2026-11-11", "2026-11-11")).toBe("2026-11-11");
	});
});

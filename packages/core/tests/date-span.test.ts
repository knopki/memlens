/**
 * #region moduleContract
 * @modulecontract
 * @purpose Check the date span of a range, so a range line names its span once.
 * @invariants The file pins the zone to Europe/Moscow before the import, so each environment gives
 *   the same result.
 * #endregion moduleContract
 */
import { describe, expect, it, vi } from "vitest";
import { dateSpan } from "../src/domain/date-span.js";

vi.hoisted(() => {
	process.env.TZ = "Europe/Moscow";
});

describe("dateSpan", () => {
	it("writes the shared prefix once", () => {
		expect(
			dateSpan("2026-11-01T08:38:36.760Z", "2026-11-02T09:00:00.000Z"),
		).toBe("2026-11-01..02");
		expect(dateSpan("2026-11-28", "2026-12-03")).toBe("2026-11-28..12-03");
		expect(dateSpan("2026-12-30", "2027-01-02")).toBe("2026-12-30..2027-01-02");
		expect(dateSpan("2026-11-11", "2026-11-11")).toBe("2026-11-11");
	});

	it("takes the day of each time in the zone of the process", () => {
		// 22:00 in UTC is 01:00 on the next day in Moscow.
		expect(
			dateSpan("2026-11-30T22:00:00.000Z", "2026-12-01T22:00:00.000Z"),
		).toBe("2026-12-01..02");
	});
});

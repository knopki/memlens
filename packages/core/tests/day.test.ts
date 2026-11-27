/**
 * #region moduleContract
 * @modulecontract
 * @purpose Check the day of a stored UTC time in the zone of the process.
 * @invariants The file pins the zone to Europe/Moscow before the import, so each environment gives
 *   the same result.
 * @keywords test, day, zone
 * #endregion moduleContract
 */

import { describe, expect, it, vi } from "vitest";
import { dayOf, parseDay } from "../src/domain/day.js";

vi.hoisted(() => {
	process.env.TZ = "Europe/Moscow";
});

describe("dayOf", () => {
	it("gives the day of the zone of the process, and not the day of UTC", () => {
		// 00:00 on 2025-05-03 in Moscow is 21:00 on 2025-05-02 in UTC.
		expect(dayOf("2025-05-02T21:00:00.000Z")).toBe("2025-05-03");
		expect(dayOf("2025-05-03T09:00:00.000Z")).toBe("2025-05-03");
	});

	it("gives a day unchanged, and the first 10 characters of a text that is not a time", () => {
		expect(dayOf("2026-11-28")).toBe("2026-11-28");
		expect(dayOf("not a time at all")).toBe("not a time");
	});
});

describe("parseDay", () => {
	it("gives a day of the calendar unchanged", () => {
		expect(parseDay("2026-11-28")).toBe("2026-11-28");
		expect(parseDay("2024-02-29")).toBe("2024-02-29");
	});

	it("gives null for a text outside YYYY-MM-DD and for a day the calendar lacks", () => {
		expect(parseDay("yesterday")).toBeNull();
		expect(parseDay("5")).toBeNull();
		expect(parseDay("2026-2-3")).toBeNull();
		expect(parseDay("2026-02-30")).toBeNull();
		expect(parseDay("2026-13-01")).toBeNull();
	});
});

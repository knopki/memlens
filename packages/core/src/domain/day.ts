/**
 * #region moduleContract
 * @modulecontract
 * @purpose Give the day of a stored UTC time in the zone of the process, so a view shows the day of the reader.
 * @scope The day text of one ISO 8601 time. NOT: the stored form of a time and the clock.
 * @keywords day, date, zone
 * #endregion moduleContract
 */

/** A day as YYYY-MM-DD. */
export const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The locale en-US keeps Latin digits. */
const dayFormat = new Intl.DateTimeFormat("en-US", {
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
});

// #region FUNC_dayOf
/**
 * @purpose Give the day of one time in the zone of the process, so a line shows the day of the reader.
 */
export function dayOf(iso: string): string {
	if (DAY.test(iso)) return iso;
	const time = Date.parse(iso);
	if (Number.isNaN(time)) return iso.slice(0, 10);
	const parts = dayFormat.formatToParts(time);
	const field = (type: Intl.DateTimeFormatPartTypes): string =>
		parts.find((part) => part.type === type)?.value ?? "";
	return `${field("year")}-${field("month")}-${field("day")}`;
}
// #endregion FUNC_dayOf

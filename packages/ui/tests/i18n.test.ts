/**
 * #region moduleContract
 * @purpose Check that the console names one language set, and that each language of that set holds
 *   every message with its placeholders.
 * #endregion moduleContract
 */

import { describe, expect, it } from "vitest";
import { LANG_NAMES, LANGS, MESSAGES } from "../src/i18n.js";

const english = MESSAGES.en;

const placeholders = (text: string): string[] =>
	[...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1] ?? "").sort();

describe("console messages", () => {
	it("names the same language set in LANGS, LANG_NAMES, and MESSAGES", () => {
		const codes = [...LANGS].sort();
		expect(Object.keys(LANG_NAMES).sort()).toEqual(codes);
		expect(Object.keys(MESSAGES).sort()).toEqual(codes);
	});

	it("holds every English key in each language", () => {
		const keys = Object.keys(english).sort();
		for (const lang of LANGS)
			expect(Object.keys(MESSAGES[lang]).sort(), lang).toEqual(keys);
	});

	it("keeps the placeholders of each message", () => {
		for (const lang of LANGS) {
			if (lang === "en") continue;
			for (const key of Object.keys(english) as (keyof typeof english)[])
				expect(placeholders(MESSAGES[lang][key]), `${lang}.${key}`).toEqual(
					placeholders(english[key]),
				);
		}
	});

	it("translates each sentence", () => {
		for (const lang of LANGS) {
			if (lang === "en") continue;
			const same = (Object.keys(english) as (keyof typeof english)[]).filter(
				(key) =>
					english[key].length > 20 && MESSAGES[lang][key] === english[key],
			);
			expect(same, lang).toEqual([]);
		}
	});
});

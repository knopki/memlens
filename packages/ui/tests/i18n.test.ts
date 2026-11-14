/**
 * #region moduleContract
 * @purpose Check that each language of the console holds every message with its placeholders.
 * #endregion moduleContract
 */

import { describe, expect, it } from "vitest";
import { LANGS, MESSAGES } from "../src/i18n.js";

const english = MESSAGES.en;

const placeholders = (text: string): string[] =>
	[...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1] ?? "").sort();

describe("console messages", () => {
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

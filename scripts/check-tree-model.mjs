#!/usr/bin/env node
// Check the tree model of the demo page against the rules of ADR 0013.
// The page holds the model in one region, so this check reads the code that the page runs.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(
	join(here, "..", "docs", "demo", "tree-model.html"),
	"utf8",
);
const start = page.indexOf("// #region model");
const end = page.indexOf("// #endregion model");

let faults = 0;

/** Report one check. */
function check(name, ok, detail) {
	if (!ok) {
		faults += 1;
		console.error(`fault: ${name}${detail ? `: ${detail}` : ""}`);
	}
}

if (start < 0 || end < 0) {
	console.error("fault: the page holds no model region");
	process.exitCode = 1;
	throw new Error("no model region");
}

const MODEL = vm.runInContext(
	`${page.slice(start, end)}\n;MODEL`,
	vm.createContext({}),
);

/** The lines of the slice for one budget. */
const lines = (budget) => MODEL.slice(budget);

/** The addresses of the lines that are not clean. */
const problems = () => MODEL.problems();

/** The last record and the count of the notes. */
const notes = () => MODEL.state.notes.length;

// 1. A frontier covers its range with no gap, and the last line is a record.
MODEL.seed();
for (let budget = 2; budget <= 20; budget += 1) {
	const slice = lines(budget);
	const last = slice[slice.length - 1];
	check(
		"last line is a record",
		last !== undefined && last.level === 0,
		`budget ${budget}`,
	);
	let cursor = slice[0].start;
	for (const line of slice) {
		check(
			"no gap",
			line.start === cursor,
			`budget ${budget}, at ${line.start}`,
		);
		cursor = line.start + 2 ** line.level;
	}
	check("coverage ends at the count", cursor === notes(), `budget ${budget}`);
}

// 2. The slice fits its budget, unless the floor evicts the oldest lines.
for (let count = 5; count <= 60; count += 1) {
	while (notes() < count) MODEL.add();
	MODEL.rebuild();
	for (let budget = 2; budget <= 20; budget += 1) {
		const slice = lines(budget);
		const evicted = slice[0].start > 0;
		check(
			"budget holds",
			slice.length <= budget || evicted,
			`${count} notes, budget ${budget}`,
		);
	}
}

// 3. A temporary line holds no text, and a summary line holds text.
for (const budget of [3, 6, 10]) {
	for (const line of lines(budget)) {
		if (line.built)
			check(
				"a built line holds text",
				line.text.length > 0,
				`budget ${budget}`,
			);
		else
			check(
				"a temporary line holds no text",
				line.text === "",
				`budget ${budget}`,
			);
		check(
			"a line holds a period",
			line.from !== "" && line.to !== "",
			`budget ${budget}`,
		);
	}
}

// 4. A merge prefers a pair that keeps the level steps at one. A greedy fold can reach a dead end
// at a small budget, so the step is one for a budget of 9 or more, and two in each other case.
MODEL.seed();
for (let count = 5; count <= 60; count += 1) {
	while (notes() < count) MODEL.add();
	MODEL.rebuild();
	for (let budget = 6; budget <= 20; budget += 1) {
		const slice = lines(budget);
		let jumps = 0;
		for (let i = 1; i < slice.length; i += 1) {
			if (Math.abs(slice[i].level - slice[i - 1].level) > 1) jumps += 1;
		}
		const limit = budget >= 9 ? 0 : 2;
		check(
			"level steps stay small",
			jumps <= limit,
			`${count} notes, budget ${budget}, ${jumps} steps`,
		);
	}
}

// 5. A change of a record invalidates each node above it, and a rebuild makes all clean.
MODEL.seed();
const amendedPair = MODEL.nodeAt(2, 1);
const amendedRoot = MODEL.nodeAt(0, 3);
MODEL.amend(2);
check(
	"the first node is invalidated",
	MODEL.isInvalidated(amendedPair) && !MODEL.isClean(amendedPair),
);
check(
	"the top node is invalidated",
	MODEL.isInvalidated(amendedRoot) && !MODEL.isClean(amendedRoot),
);
MODEL.rebuild();
check("a rebuild leaves no dirty node", problems().dirty.length === 0);
check("a rebuild leaves no unbuilt node", problems().bad.length === 0);

// 6. A repeated rebuild builds nothing.
check("a repeated rebuild builds nothing", MODEL.rebuild().length === 0);

// 7. A record always takes the end of the scope, after an import and after a rebuild.
MODEL.seed();
MODEL.addMany(16);
MODEL.rebuild();
MODEL.mergeSecond();
MODEL.rebuild();
MODEL.add();
const times = MODEL.state.notes.map((note) => note.atNum);
let monotone = true;
for (let i = 1; i < times.length; i += 1)
	if (times[i - 1] > times[i]) monotone = false;
check("an append takes the last position", monotone);

// 8. An insert invalidates the nodes above it, and a rebuild repairs them.
MODEL.seed();
const insertPrefix = MODEL.nodeAt(0, 2);
MODEL.insertAt(4);
check(
	"an insert invalidates the nodes above it",
	MODEL.state.invalidations.length > 0,
);
check(
	"an insert keeps an unaffected prefix",
	MODEL.nodeAt(0, 2)?.id === insertPrefix.id && MODEL.isClean(insertPrefix),
);
MODEL.rebuild();
check(
	"a rebuild repairs the nodes",
	problems().bad.length === 0 && problems().dirty.length === 0,
);

// 9. An imported amend at time 150 changes a note at time 100. The maximum child order stays 200,
// but the old pair and each ancestor must be invalid. The sibling stays usable.
MODEL.seed();
const oldPair = MODEL.nodeAt(0, 1);
const oldQuad = MODEL.nodeAt(0, 2);
const oldRoot = MODEL.nodeAt(0, 3);
const oldSibling = MODEL.nodeAt(4, 2);
const invalidationsBefore = MODEL.state.invalidations.length;
MODEL.importAmend(0, 150, "imported old amend", "import-old-1");
check("an old amend invalidates the pair", MODEL.isInvalidated(oldPair));
check("an old amend invalidates the quad", MODEL.isInvalidated(oldQuad));
check("an old amend invalidates the root", MODEL.isInvalidated(oldRoot));
check(
	"an old amend leaves the sibling usable",
	MODEL.nodeAt(4, 2)?.id === oldSibling.id && MODEL.isClean(oldSibling),
);
check(
	"an old amend adds one invalidation",
	MODEL.state.invalidations.length === invalidationsBefore + 1,
);
check(
	"an old amend leaves no stale fallback",
	MODEL.nodeAt(0, 1) === null &&
		MODEL.nodeAt(0, 2) === null &&
		MODEL.nodeAt(0, 3) === null,
);

const temporary = MODEL.slice(4).find(
	(line) => line.start === 0 && line.level > 0,
);
check(
	"the slice gives no stale text after an old amend",
	temporary !== undefined && !temporary.built && temporary.text === "",
);

// 10. A JSON round-trip keeps the physical invalidation history.
const saved = MODEL.serialize();
MODEL.restore(saved);
check(
	"a JSON round-trip keeps each invalidation",
	MODEL.state.invalidations.length === invalidationsBefore + 1,
);
check("a JSON round-trip keeps the pair invalid", MODEL.isInvalidated(oldPair));
check(
	"a JSON round-trip keeps the sibling usable",
	MODEL.nodeAt(4, 2)?.id === oldSibling.id && MODEL.isClean(oldSibling),
);

// 11. A rebuild writes a new node, keeps the old invalidation, and a repeated import is inert.
MODEL.rebuild();
const rebuiltPair = MODEL.nodeAt(0, 1);
check(
	"a rebuild restores a clean tree",
	problems().bad.length === 0 && problems().dirty.length === 0,
);
check(
	"a rebuild writes a new node id",
	rebuiltPair !== null && rebuiltPair.id !== oldPair.id,
);
check(
	"a rebuild keeps the physical invalidation",
	MODEL.state.invalidations.length === invalidationsBefore + 1 &&
		MODEL.isInvalidated(oldPair),
);
const bodyAfterRebuild = MODEL.noteAt(0).body;
const invalidationsAfterRebuild = MODEL.state.invalidations.length;
MODEL.importAmend(0, 150, "imported old amend", "import-old-1");
check(
	"a repeated import adds no invalidation",
	MODEL.state.invalidations.length === invalidationsAfterRebuild,
);
check(
	"a repeated import keeps the rebuilt node",
	MODEL.nodeAt(0, 1)?.id === rebuiltPair.id && MODEL.isClean(rebuiltPair),
);
check(
	"a repeated import changes no note",
	MODEL.noteAt(0).body === bodyAfterRebuild,
);
MODEL.importAmend(0, 150, "resolved replacement payload", "import-old-1");
check(
	"a changed payload with the same id invalidates again",
	MODEL.isInvalidated(rebuiltPair) && MODEL.nodeAt(0, 1) === null,
);
check(
	"invalidation has its own event id",
	MODEL.state.invalidations.every((event) => event.id !== "import-old-1"),
);

// 12. A tail merge preserves the complete common prefix.
MODEL.seed();
const prefixRoot = MODEL.nodeAt(0, 3);
MODEL.insertAt(8, "imported tail");
check(
	"a tail merge preserves the prefix root",
	MODEL.nodeAt(0, 3)?.id === prefixRoot.id && MODEL.isClean(prefixRoot),
);

// 13. The exact input check rejects an old imported amend during a writer call.
MODEL.seed();
const staleInput = MODEL.buildInput(0, 1);
MODEL.importAmend(0, 150, "changed during the call", "import-race");
check(
	"a stale writer result is rejected",
	MODEL.commitBuild(staleInput, "stale") === false,
);
check(
	"a parent waits for invalidated children",
	MODEL.buildInput(0, 2) === null,
);
const freshInput = MODEL.buildInput(0, 1);
check(
	"a fresh writer result is accepted",
	MODEL.commitBuild(freshInput, "fresh") === true,
);
check(
	"two writers can commit unchanged inputs",
	MODEL.commitBuild(freshInput, "also fresh") === true,
);

if (faults > 0) {
	console.error(`tree model: ${faults} faults`);
	process.exitCode = 1;
} else {
	console.log("tree model: ok");
}

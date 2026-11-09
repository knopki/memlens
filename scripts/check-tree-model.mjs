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

// 5. A change of a record makes each node above it dirty, and a rebuild makes all clean.
MODEL.seed();
MODEL.amend(2);
const dirtied = problems().dirty;
check("the first node is dirty", dirtied.includes("2..3"), dirtied.join(" "));
check("the top node is dirty", dirtied.includes("0..7"), dirtied.join(" "));
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

// 8. An insert at one position makes the nodes above it not built, and a rebuild repairs them.
MODEL.seed();
MODEL.insertAt(4);
check("an insert breaks the nodes above it", problems().bad.length > 0);
MODEL.rebuild();
check(
	"a rebuild repairs the nodes",
	problems().bad.length === 0 && problems().dirty.length === 0,
);

if (faults > 0) {
	console.error(`tree model: ${faults} faults`);
	process.exitCode = 1;
} else {
	console.log("tree model: ok");
}

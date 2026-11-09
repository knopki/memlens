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

/** @purpose Give the model a dense prefix of the seed records. */
function seedPrefix(count) {
	MODEL.seed();
	const data = JSON.parse(MODEL.serialize());
	data.notes = data.notes.slice(0, count);
	data.nodes = [];
	data.invalidations = [];
	data.imports = [];
	MODEL.restore(data);
}

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

// 14. One note gives a level-1 root, and the root copies the record text and period.
seedPrefix(1);
check("one note gives a level-1 top", MODEL.topLevel() === 1);
const oneInput = MODEL.buildInput(0, 1);
check(
	"one note leaves the empty child null",
	oneInput !== null &&
		oneInput.children[0] !== null &&
		oneInput.children[1] === null,
);
MODEL.rebuild();
const oneRoot = MODEL.nodeAt(0, 1);
const oneNote = MODEL.noteAt(0);
const onePeriod = MODEL.periodOf({ start: 0, level: 1 });
check(
	"one note root copies the record text",
	oneRoot !== null && oneRoot.summary === oneNote.body,
);
check(
	"one note root has one child id",
	oneRoot !== null &&
		oneRoot.child_a === oneNote.id &&
		oneRoot.child_b === null,
);
check("one note root is clean", oneRoot !== null && MODEL.isClean(oneRoot));
check(
	"one note root keeps the record period",
	onePeriod.from !== "" &&
		onePeriod.from === onePeriod.to &&
		oneRoot.ts_from === onePeriod.from &&
		oneRoot.ts_to === onePeriod.to,
);

// 15. Five notes give a level-3 partial root, and each child covers one half.
seedPrefix(5);
MODEL.rebuild();
const fiveRoot = MODEL.nodeAt(0, 3);
const fiveLeft = MODEL.nodeAt(0, 2);
const fiveRight = MODEL.nodeAt(4, 2);
check("five notes give a level-3 top", MODEL.topLevel() === 3);
check(
	"five notes build the partial root",
	fiveRoot !== null && fiveRoot.level === 3 && MODEL.isClean(fiveRoot),
);
check(
	"the partial root keeps both child ids",
	fiveRoot?.child_a === fiveLeft?.id && fiveRoot?.child_b === fiveRight?.id,
);
check(
	"the right partial node has one empty child",
	fiveRight !== null && fiveRight.child_b === null && MODEL.isValid(fiveRight),
);
check(
	"the partial root period ends at the last live note",
	MODEL.periodOf({ start: 0, level: 3 }).from !== "" &&
		MODEL.periodOf({ start: 0, level: 3 }).to ===
			MODEL.periodOf({ start: 4, level: 2 }).to,
);

// 16. The root extent stays 1024 when only the last assigned record is live.
MODEL.seed();
MODEL.addMany(1016);
MODEL.rebuild();
const hiddenPositions = [];
for (let pos = 0; pos < 1023; pos += 1) {
	MODEL.state.notes[pos].state = "hidden";
	hiddenPositions.push(pos);
}
MODEL.invalidateNotePositions(hiddenPositions);
const sparseBuilt = MODEL.rebuild();
const sparseRoot = MODEL.nodeAt(0, 10);
const sparseSlice = MODEL.slice(10);
const sparseLast = sparseSlice[sparseSlice.length - 1];
check("1024 assigned records give level 10", MODEL.topLevel() === 10);
check(
	"the sparse root has one null child",
	sparseRoot !== null &&
		sparseRoot.child_a === null &&
		sparseRoot.child_b !== null,
);
check("the sparse rebuild builds the root", sparseBuilt.length > 0);
check(
	"the highest live position stays a leaf",
	sparseLast !== undefined &&
		sparseLast.start === 1023 &&
		sparseLast.level === 0,
);

// 17. A hidden tail leaves the new highest live position on a leaf line.
MODEL.seed();
MODEL.hide(7);
MODEL.rebuild();
for (const budget of [1, 2, 3]) {
	const tailSlice = MODEL.slice(budget);
	const highest = tailSlice.find((line) => line.start === 6);
	check(
		"a hidden tail keeps the highest live leaf",
		highest !== undefined && highest.level === 0,
		`budget ${budget}`,
	);
	check(
		"a hidden tail renders no tail line",
		!tailSlice.some((line) => line.start === 7),
		`budget ${budget}`,
	);
}

// 18. Hiding every record gives an empty slice, and it builds no empty node.
MODEL.seed();
const nodeCountBeforeHideAll = MODEL.state.nodes.length;
for (let pos = 0; pos < notes(); pos += 1) MODEL.hide(pos);
const hiddenBuilt = MODEL.rebuild();
check("all hidden keeps the assigned geometry", MODEL.topLevel() !== null);
check("all hidden gives an empty build input", MODEL.buildInput(0, 1) === null);
check("all hidden gives an empty slice", MODEL.slice(1).length === 0);
check("all hidden builds no node", hiddenBuilt.length === 0);
check(
	"two empty halves do not form a valid node",
	!MODEL.isValid({ start: 0, level: 1, child_a: null, child_b: null }),
);
check(
	"all hidden appends no node event",
	MODEL.state.nodes.length === nodeCountBeforeHideAll,
);

// 19. An interior hole renders no line, and it moves no position.
MODEL.seed();
const interiorIds = MODEL.state.notes.map((note) => note.id);
const interiorCount = notes();
MODEL.hide(2);
MODEL.rebuild();
const holeSlice = MODEL.slice(10);
check(
	"an interior hole renders no leaf",
	!holeSlice.some((line) => line.start === 2 && line.level === 0),
);
check(
	"an interior hole keeps the position count",
	notes() === interiorCount &&
		MODEL.state.notes.every((note, pos) => note.id === interiorIds[pos]),
);
check(
	"an interior hole gives no blank period",
	holeSlice.every((line) => line.from !== "" && line.to !== ""),
);

// 20. A null child that becomes live rejects the old writer input.
MODEL.seed();
MODEL.hide(0);
MODEL.rebuild();
const nullChildInput = MODEL.buildInput(0, 1);
check(
	"a writer input holds a null empty child",
	nullChildInput !== null &&
		nullChildInput.children[0] === null &&
		nullChildInput.children[1] !== null,
);
MODEL.state.notes[0].state = "live";
check(
	"a null-to-live change rejects the old result",
	MODEL.commitBuild(nullChildInput, "stale copy") === false,
);
check(
	"a fresh input sees the restored record",
	MODEL.buildInput(0, 1)?.children[0]?.id === MODEL.noteAt(0).id,
);
delete MODEL.state.notes[0].state;
check(
	"an absent record state is live",
	MODEL.liveNoteAt(0) === MODEL.noteAt(0) && MODEL.hasLive(0),
);

// 21. A null child is valid only over an empty half, and one-child build copies the child text.
MODEL.seed();
MODEL.hide(0);
MODEL.rebuild();
const sparsePair = MODEL.nodeAt(0, 1);
check(
	"a null child over an empty half is valid",
	sparsePair !== null &&
		sparsePair.child_a === null &&
		MODEL.isValid(sparsePair),
);
check(
	"a null child over a live half is invalid",
	sparsePair !== null && !MODEL.isValid({ ...sparsePair, child_b: null }),
);
const copyInput = MODEL.buildInput(0, 1);
check(
	"the one-child copy is committed",
	MODEL.commitBuild(copyInput, "generated text") === true,
);
check(
	"the one-child commit ignores the given summary",
	MODEL.nodeAt(0, 1)?.summary === MODEL.noteAt(1).body,
);
MODEL.seed();
const explicitInput = MODEL.buildInput(0, 1);
check(
	"the two-child build is committed",
	MODEL.commitBuild(explicitInput, "explicit summary") === true,
);
check(
	"the two-child commit uses the given summary",
	MODEL.nodeAt(0, 1)?.summary === "explicit summary",
);

// 22. A JSON round-trip keeps a sparse state and its null child references.
MODEL.seed();
MODEL.hide(1);
MODEL.hide(7);
MODEL.rebuild();
const sparseBefore = MODEL.slice(5);
const sparseSaved = MODEL.serialize();
MODEL.restore(sparseSaved);
const sparseAfter = MODEL.slice(5);
check(
	"a restore keeps the sparse slice",
	JSON.stringify(sparseAfter) === JSON.stringify(sparseBefore),
);
check(
	"a restore keeps each hidden state",
	MODEL.liveNoteAt(1) === null &&
		MODEL.noteAt(1).state === "hidden" &&
		MODEL.liveNoteAt(7) === null,
);
check(
	"a restore keeps the null child reference",
	MODEL.state.nodes.some(
		(node) => node.child_a === null || node.child_b === null,
	),
);

if (faults > 0) {
	console.error(`tree model: ${faults} faults`);
	process.exitCode = 1;
} else {
	console.log("tree model: ok");
}

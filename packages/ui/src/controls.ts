/**
 * #region moduleContract
 * @purpose Report the result of each console action in one status line and keep one failed action
 * from blocking the next one.
 * @scope The status element, the timed message, the error guard, and the guarded button. NOT: the
 * screens and the host calls.
 * @dependencies WRITES: the status element in the page root.
 * @keywords status, message, error, button, feedback
 * #endregion moduleContract
 */

import { el } from "./dom.js";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Console root is absent");

const status = el("div");
status.id = "status";
status.setAttribute("role", "status");
status.setAttribute("aria-live", "polite");
app.append(status);

let messageTimer: ReturnType<typeof setTimeout> | undefined;

// #region FUNC_message
/**
 * @purpose Show one status message and clear it after its time.
 * @invariants The message goes into a text node, never into markup. An open dialog takes the
 * message in its own note row. A success clears after 2.5 seconds and an error after 8 seconds.
 */
export function message(text: string, error = false): void {
	clearTimeout(messageTimer);
	const note = document.querySelector<HTMLElement>("dialog[open] .dlg-note");
	if (note) status.textContent = "";
	const target = note ?? status;
	target.textContent = text;
	target.classList.toggle("error", error);
	if (text)
		messageTimer = setTimeout(
			() => {
				target.textContent = "";
			},
			error ? 8000 : 2500,
		);
}
// #endregion FUNC_message

// #region FUNC_run
/**
 * @purpose Run one action and report its error in the status line.
 * @invariants A failed action leaves the page ready for the next action.
 */
export async function run(fn: () => unknown): Promise<void> {
	try {
		await fn();
	} catch (error) {
		console.debug("Console action failed", {
			event: "error",
			message: String(error),
		});
		message(error instanceof Error ? error.message : String(error), true);
	}
}
// #endregion FUNC_run

// #region FUNC_btn
/**
 * @purpose Build a button that runs its action behind the error guard.
 */
export function btn(
	text: string,
	fn: () => unknown,
	className = "",
): HTMLButtonElement {
	const node = el("button", text, `btn ${className}`.trim());
	node.type = "button";
	node.addEventListener("click", () => run(fn));
	return node;
}
// #endregion FUNC_btn

/**
 * #region moduleContract
 * @purpose Let the data layer ask for a redraw without a direct import of the assembly point, so
 * the modules form no import cycle.
 * @scope The draw hook and its setter. NOT: the drawing and the state.
 * @invariants The hook writes nothing before the assembly point sets it.
 * @keywords redraw, hook, render, cycle
 * #endregion moduleContract
 */

/** The draw step of the page, set once by the assembly point. */
let draw = (): void => {};

// #region FUNC_setDraw
/**
 * @purpose Give the page its draw step.
 * @param fn - The function that draws the page from the current state.
 */
export function setDraw(fn: () => void): void {
	draw = fn;
}
// #endregion FUNC_setDraw

// #region FUNC_repaint
/**
 * @purpose Ask the page to draw the current state.
 */
export function repaint(): void {
	draw();
}
// #endregion FUNC_repaint

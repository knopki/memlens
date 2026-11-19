/**
 * #region moduleContract
 * @purpose Give the memory surfaces their own stylesheet, so the shared console components read as
 *   one page inside the harness Web page and no harness style changes.
 * @scope The harness palette, the surface shell, and the host overrides of the shared rules.
 * NOT: the components, the state, and the transport.
 * @invariants Each selector starts with the surface root class `.ml-console`, so no rule reaches
 *   outside a surface and no page rule reaches inside it.
 * @invariants Each colour is a harness alias token of the family `--dsw-alias-*`. The sheet holds no
 *   literal colour.
 * @invariants The sheet states the border box inside the surface, so a control of the page and a
 *   control of the surface keep one size.
 * @invariants A result line holds four fixed tracks, so each row starts its columns at one place.
 *   A long address cuts the scope prefix and keeps the position.
 * @invariants A caption of the page head shares the baseline of its value, so the head reads as one
 *   line of text.
 * @invariants A row caption keeps its width and its line, so a long list beside it never squeezes
 *   the caption.
 * @invariants The scope row shows each scope. A height limit belongs to the slice, not to the
 *   scope list.
 * @invariants A dialog with no status text shows no status row, so the footer follows the last
 *   field.
 * @invariants The sheet is a text constant. Each surface renders it in a `style` element, so the
 *   CSS leaves the page with its surface.
 * @keywords client, style, css, token, alias, tab
 * #endregion moduleContract
 */

import { CONSOLE_RULES } from "@memlens/ui/styles";

// #region CONST_CONSOLE_CSS
/**
 * @purpose Hold the stylesheet of the surfaces.
 * @invariants The rules follow the class names that the shared components and the primitives emit.
 */
export const CONSOLE_CSS = `${CONSOLE_RULES}
.ml-console {
	--ml-accent: var(--dsw-alias-brand-primary);
	--ml-line-strong: var(--dsw-alias-border-l2);
	--ml-pill-bg: var(--dsw-alias-bg-layer-2);
	--ml-muted: var(--dsw-alias-label-secondary);
	--ml-warn-label: var(--dsw-alias-state-warn-label);
	--ml-button-border: var(--dsw-alias-border-l2);
	--ml-button-bg: var(--dsw-alias-button-elevated-fill);
	--ml-text: var(--dsw-alias-label-primary);
	--ml-primary-bg: var(--dsw-alias-button-primary-fill);
	--ml-primary-text: var(--dsw-alias-label-primary-foreground);
	--ml-error: var(--dsw-alias-state-error-primary);
	--ml-panel-bg: var(--dsw-alias-bg-layer-1);
	--ml-panel-border: var(--dsw-alias-border-l2);
	--ml-active-bg: var(--dsw-alias-interactive-bg-hover-accent);
	--ml-success: var(--dsw-alias-state-success-primary);
	--ml-warn: var(--dsw-alias-state-warn-primary);
	--ml-hover-bg: var(--dsw-alias-interactive-bg-hover);
	--ml-quote-bg: var(--dsw-alias-bg-layer-2);
	--ml-quote-border: var(--dsw-alias-border-l3);
	--ml-label: var(--dsw-alias-label-tertiary);
	--ml-line: var(--dsw-alias-border-l1);
	--ml-filter-border: var(--dsw-alias-border-l2);
	--ml-filter-bg: var(--dsw-alias-bg-layer-1);
	--ml-filter-text: var(--dsw-alias-label-primary);
	--ml-kind: var(--dsw-alias-state-business-primary);
	--ml-slice-bg: var(--dsw-alias-bg-layer-2);
	--ml-slice-border: var(--dsw-alias-border-l1);
	--ml-field-border: var(--dsw-alias-border-l2);
	--ml-field-bg: var(--dsw-alias-bg-layer-2);
	--ml-field-text: var(--dsw-alias-label-primary);
	--ml-dim: var(--dsw-alias-label-dimmed);
	--ml-dialog-border: var(--dsw-alias-border-l2);
	--ml-dialog-bg: var(--dsw-alias-bg-layer-1);
	--ml-backdrop: var(--dsw-alias-bg-mask-1);
	--ml-bg: var(--dsw-alias-bg-base);
	--ml-primary-hover: var(--dsw-alias-button-primary-hover);
}
.ml-console {
	position: relative;
	display: flex;
	flex-direction: column;
	height: 100%;
	min-height: 0;
	background: var(--ml-bg);
	color: var(--ml-text);
	font: 13px / 1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
.ml-console .ml-bar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 4px 12px;
	padding: 8px 12px;
	background: var(--ml-panel-bg);
	border-bottom: 1px solid var(--ml-line-strong);
}
.ml-console .ml-bar-title {
	color: var(--ml-label);
	font-size: 10px;
	text-transform: uppercase;
	letter-spacing: 0.08em;
}
.ml-console .ml-screen {
	padding: 4px 8px;
	border: 1px solid transparent;
	border-radius: 6px;
	background: transparent;
	color: var(--ml-muted);
	font: inherit;
	text-align: left;
	cursor: pointer;
}
.ml-console .ml-screen:hover {
	background: var(--ml-hover-bg);
	color: var(--ml-text);
}
.ml-console .ml-screen.on {
	background: var(--ml-active-bg);
	border-color: var(--ml-accent);
	color: var(--ml-accent);
}
.ml-console .ml-new {
	margin-left: auto;
	padding: 4px 10px;
	border: 1px solid var(--ml-line-strong);
	border-radius: 6px;
	background: var(--ml-primary-bg);
	color: var(--ml-primary-text);
	font: inherit;
	cursor: pointer;
}
.ml-console .ml-new:hover {
	background: var(--ml-primary-hover);
}
.ml-console .ml-body {
	display: grid;
	flex: 1 1 auto;
	align-content: start;
	gap: 14px;
	min-height: 0;
	padding: 14px 16px 26px;
	overflow: auto;
}
.ml-console .btn.pri:hover:not(:disabled) {
	background: var(--ml-primary-hover);
	border-color: var(--ml-primary-hover);
}
.ml-console .line {
	color: var(--ml-text);
}
.ml-console .lbl {
	color: var(--ml-label);
	font-size: 11px;
	letter-spacing: 0.06em;
	text-transform: uppercase;
}
.ml-console .filters select,
.ml-console .filters input {
	height: 30px;
}
.ml-console .status {
	position: absolute;
	left: 50%;
	bottom: 14px;
	z-index: 20;
	max-width: min(620px, 90vw);
	padding: 0;
	background: var(--ml-panel-bg);
	border: 1px solid transparent;
	border-radius: 8px;
	color: var(--ml-muted);
	font-size: 12px;
	opacity: 0;
	pointer-events: none;
	transform: translateX(-50%);
	transition: opacity 120ms;
}
.ml-console .status:not(:empty) {
	padding: 7px 12px;
	border-color: var(--ml-line-strong);
	opacity: 1;
}
.ml-console .status.error {
	color: var(--ml-error);
}
.ml-console .status.error:not(:empty) {
	border-color: var(--ml-error);
}
.ml-console.ml-page {
	height: 100%;
}
.ml-console .ml-head {
	display: flex;
	flex-wrap: wrap;
	align-items: baseline;
	gap: 6px 12px;
	padding: 8px 12px;
	border-bottom: 1px solid var(--ml-line-strong);
	background: var(--ml-panel-bg);
}
.ml-console .ml-title {
	color: var(--ml-text);
	font-size: 13px;
	font-weight: 600;
}
.ml-console .ml-hspacer {
	flex: 1 1 auto;
}
.ml-console .ml-field {
	display: inline-flex;
	align-items: baseline;
	gap: 6px;
}
.ml-console .ml-field select {
	max-width: 220px;
	padding: 3px 6px;
	border: 1px solid var(--ml-line-strong);
	border-radius: 6px;
	background: var(--ml-bg);
	color: var(--ml-text);
	font: inherit;
	font-size: 12px;
}
.ml-console .ml-scope-field select {
	max-width: min(320px, 32vw);
}
.ml-console .ml-chip {
	display: inline-flex;
	align-items: baseline;
	gap: 6px;
	font-size: 12px;
	color: var(--ml-muted);
}
.ml-console .ml-chip b {
	color: var(--ml-text);
	font-weight: 600;
}
.ml-console.ml-session .ml-head {
	padding: 8px 12px;
}
.ml-console .ml-scoperow {
	display: flex;
	flex: 0 0 auto;
	align-items: flex-start;
	gap: 8px;
	min-width: 0;
	padding: 8px 12px 0;
}
.ml-console .ml-scoperow .ml-bar-title {
	flex: 0 0 auto;
	padding-top: 3px;
	white-space: nowrap;
}
.ml-console .ml-scopelist {
	display: flex;
	flex: 1 1 auto;
	flex-wrap: wrap;
	gap: 4px;
	min-width: 0;
}
.ml-console .ml-scope-tag {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	padding: 1px 8px;
	border: 1px solid var(--ml-line-strong);
	border-radius: 999px;
	color: var(--ml-muted);
	font-family: var(--ml-mono);
	font-size: 11px;
	word-break: break-all;
}
.ml-console .ml-scope-tag.on {
	border-color: var(--ml-accent);
	color: var(--ml-text);
}
.ml-console .ml-scope-tag i {
	color: var(--ml-label);
	font-style: normal;
}
.ml-console .ml-slice-head {
	display: flex;
	justify-content: space-between;
	gap: 8px;
	padding: 12px 12px 4px;
	color: var(--ml-label);
	font-size: 10px;
	letter-spacing: 0.08em;
	text-transform: uppercase;
}
.ml-console .ml-slice {
	flex: 1 1 auto;
	min-height: 0;
	margin: 0;
	padding: 0 12px 30px;
	overflow: auto;
	color: var(--ml-muted);
	font-family: var(--ml-mono);
	font-size: 12px;
	line-height: 1.5;
	white-space: pre-wrap;
	word-break: break-word;
}
.ml-console .ml-muted {
	margin: 12px;
	color: var(--ml-label);
	font-size: 12px;
}
@media (max-width: 860px) {
	.ml-console .row2 {
		grid-template-columns: 1fr;
	}
}
`;
// #endregion CONST_CONSOLE_CSS

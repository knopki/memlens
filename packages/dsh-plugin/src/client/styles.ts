/**
 * #region moduleContract
 * @purpose Give the memory tab its own stylesheet, so the shared console components read as one page
 *   inside the harness Web page and no harness style changes.
 * @scope The class names of the shared components and the primitives, the record dialog, the status
 *   line, and the tab bar. NOT: the components, the state, and the transport.
 * @invariants Each selector starts with the tab root class `.ml-tab`, so no rule reaches outside the
 *   tab and no page rule reaches inside it.
 * @invariants Each colour is a harness alias token of the family `--dsw-alias-*`. The sheet holds no
 *   literal colour.
 * @invariants The sheet is a text constant. The tab renders it in a `style` element, so the CSS
 *   leaves the page with the tab.
 * @rationale
 *  - Q: Why not reuse the standalone stylesheet? A: It holds literal colours and its own palettes.
 *    The harness page supplies the alias tokens instead.
 * @keywords client, style, css, token, alias, tab
 * #endregion moduleContract
 */

// #region CONST_TAB_CSS
/**
 * @purpose Hold the stylesheet of the tab.
 * @invariants The rules follow the class names that the shared components and the primitives emit.
 */
export const TAB_CSS = `
.ml-tab {
	position: relative;
	display: flex;
	flex-direction: column;
	height: 100%;
	min-height: 0;
	background: var(--dsw-alias-bg-base);
	color: var(--dsw-alias-label-primary);
	font: 13px / 1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
.ml-tab :focus-visible {
	outline: 2px solid var(--dsw-alias-brand-primary);
	outline-offset: 1px;
}
.ml-tab .ml-bar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 4px 12px;
	padding: 8px 12px;
	background: var(--dsw-alias-bg-layer-1);
	border-bottom: 1px solid var(--dsw-alias-border-l2);
}
.ml-tab .ml-bar-title {
	color: var(--dsw-alias-label-tertiary);
	font-size: 10px;
	text-transform: uppercase;
	letter-spacing: 0.08em;
}
.ml-tab .ml-screens,
.ml-tab .ml-scopes {
	display: flex;
	flex-wrap: wrap;
	gap: 4px;
	margin: 0;
	padding: 0;
	list-style: none;
}
.ml-tab .ml-screen,
.ml-tab .ml-scope {
	padding: 4px 8px;
	border: 1px solid transparent;
	border-radius: 6px;
	background: transparent;
	color: var(--dsw-alias-label-secondary);
	font: inherit;
	text-align: left;
	cursor: pointer;
}
.ml-tab .ml-screen:hover,
.ml-tab .ml-scope:hover {
	background: var(--dsw-alias-interactive-bg-hover);
	color: var(--dsw-alias-label-primary);
}
.ml-tab .ml-screen.on,
.ml-tab .ml-scope.on {
	background: var(--dsw-alias-interactive-bg-hover-accent);
	border-color: var(--dsw-alias-brand-primary);
	color: var(--dsw-alias-brand-primary);
}
.ml-tab .ml-scope {
	font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
	font-size: 11.5px;
	word-break: break-all;
}
.ml-tab .ml-new {
	margin-left: auto;
	padding: 4px 10px;
	border: 1px solid var(--dsw-alias-border-l2);
	border-radius: 6px;
	background: var(--dsw-alias-button-primary-fill);
	color: var(--dsw-alias-label-on-color);
	font: inherit;
	cursor: pointer;
}
.ml-tab .ml-new:hover {
	background: var(--dsw-alias-button-primary-hover);
}
.ml-tab .ml-body {
	display: grid;
	flex: 1 1 auto;
	align-content: start;
	gap: 14px;
	min-height: 0;
	padding: 14px 16px 26px;
	overflow: auto;
}
.ml-tab .sub {
	margin: 0;
	max-width: 78ch;
	color: var(--dsw-alias-label-secondary);
}
.ml-tab .muted {
	color: var(--dsw-alias-label-secondary);
}
.ml-tab .panel {
	display: grid;
	gap: 10px;
	min-width: 0;
	padding: 12px 14px;
	background: var(--dsw-alias-bg-layer-1);
	border: 1px solid var(--dsw-alias-border-l2);
	border-radius: 10px;
}
.ml-tab .panel .head {
	display: flex;
	align-items: baseline;
	justify-content: space-between;
	gap: 12px;
}
.ml-tab .panel .head .t {
	font-weight: 600;
}
.ml-tab .panel .head .r {
	color: var(--dsw-alias-label-secondary);
	font-size: 12px;
}
.ml-tab .cards {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
	gap: 12px;
}
.ml-tab .card {
	display: grid;
	gap: 8px;
	min-width: 0;
	padding: 12px 14px;
	background: var(--dsw-alias-bg-layer-1);
	border: 1px solid var(--dsw-alias-border-l2);
	border-radius: 10px;
}
.ml-tab .card.active {
	border-color: var(--dsw-alias-brand-primary);
}
.ml-tab .card-head {
	display: flex;
	align-items: center;
	gap: 8px;
	min-width: 0;
}
.ml-tab .card-head .key {
	font-weight: 600;
	word-break: break-all;
}
.ml-tab .tag {
	padding: 1px 6px;
	border-radius: 999px;
	background: var(--dsw-alias-interactive-bg-hover-accent);
	color: var(--dsw-alias-brand-primary);
	font-size: 11px;
}
.ml-tab .stats {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	color: var(--dsw-alias-label-secondary);
	font-size: 12px;
}
.ml-tab .mini {
	display: grid;
	gap: 4px;
	overflow: hidden;
	color: var(--dsw-alias-label-secondary);
	font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
	font-size: 11.5px;
}
.ml-tab .mini div {
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
}
.ml-tab .card .btn {
	justify-self: start;
}
.ml-tab pre.slice {
	margin: 0;
	padding: 12px 14px;
	background: var(--dsw-alias-bg-layer-2);
	border: 1px solid var(--dsw-alias-border-l1);
	border-radius: 8px;
	font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
	font-size: 12px;
	line-height: 1.5;
	white-space: pre-wrap;
	word-break: break-word;
}
.ml-tab .split {
	display: grid;
	grid-template-columns: minmax(0, 1fr) minmax(280px, 0.8fr);
	align-items: start;
	gap: 14px;
}
.ml-tab .column {
	display: grid;
	gap: 14px;
}
.ml-tab .legend {
	display: flex;
	flex-wrap: wrap;
	gap: 12px;
	color: var(--dsw-alias-label-secondary);
	font-size: 12px;
}
.ml-tab .legend .lg::before {
	content: "";
	display: inline-block;
	width: 9px;
	height: 9px;
	margin-right: 5px;
	border-radius: 2px;
	background: var(--dsw-alias-fill-l2);
	vertical-align: -1px;
}
.ml-tab .legend .lg.r::before {
	background: var(--dsw-alias-state-success-primary);
}
.ml-tab .legend .lg.s::before {
	background: var(--dsw-alias-brand-primary);
}
.ml-tab .legend .lg.t::before {
	background: var(--dsw-alias-state-warn-primary);
}
.ml-tab .lines {
	display: grid;
	gap: 3px;
}
.ml-tab button,
.ml-tab select,
.ml-tab input,
.ml-tab textarea {
	font: inherit;
	color: inherit;
}
.ml-tab .btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 6px;
	min-height: 28px;
	padding: 4px 10px;
	border: 1px solid var(--dsw-alias-border-l2);
	border-radius: 7px;
	background: var(--dsw-alias-button-elevated-fill);
	color: var(--dsw-alias-label-primary);
	cursor: pointer;
}
.ml-tab .btn:hover:not(:disabled) {
	border-color: var(--dsw-alias-brand-primary);
}
.ml-tab .btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}
.ml-tab .btn.pri {
	background: var(--dsw-alias-button-primary-fill);
	border-color: var(--dsw-alias-button-primary-fill);
	color: var(--dsw-alias-label-on-color);
}
.ml-tab .btn.pri:hover:not(:disabled) {
	background: var(--dsw-alias-button-primary-hover);
	border-color: var(--dsw-alias-button-primary-hover);
}
.ml-tab .btn.ghost {
	background: transparent;
}
.ml-tab .btn.danger {
	border-color: var(--dsw-alias-state-error-primary);
	color: var(--dsw-alias-state-error-primary);
}
.ml-tab .line {
	display: grid;
	grid-template-columns: minmax(90px, auto) minmax(0, 1fr);
	align-items: baseline;
	gap: 10px;
	width: 100%;
	padding: 5px 9px;
	border: 1px solid transparent;
	border-radius: 6px;
	background: transparent;
	color: var(--dsw-alias-label-primary);
	font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
	font-size: 12px;
	text-align: left;
	cursor: pointer;
}
.ml-tab .line:hover {
	background: var(--dsw-alias-interactive-bg-hover);
}
.ml-tab .line.sel {
	background: var(--dsw-alias-interactive-bg-hover-accent);
	border-color: var(--dsw-alias-brand-primary);
}
.ml-tab .line .id {
	color: var(--dsw-alias-label-secondary);
}
.ml-tab .keys .line .id {
	max-width: 26ch;
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
}
.ml-tab .line.r .id {
	color: var(--dsw-alias-state-success-primary);
}
.ml-tab .line.s .id {
	color: var(--dsw-alias-brand-primary);
}
.ml-tab .line.t .id {
	color: var(--dsw-alias-state-warn-primary);
}
.ml-tab .line .tx {
	overflow: hidden;
	font-family: inherit;
	white-space: nowrap;
	text-overflow: ellipsis;
}
.ml-tab .line.pending .tx {
	color: var(--dsw-alias-state-warn-primary);
}
.ml-tab .ins .quote {
	padding: 10px 12px;
	background: var(--dsw-alias-bg-layer-2);
	border-left: 3px solid var(--dsw-alias-border-l3);
	border-radius: 0 6px 6px 0;
	white-space: pre-wrap;
}
.ml-tab .ins .quote .doc {
	margin-top: 8px;
	color: var(--dsw-alias-label-secondary);
	font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
	font-size: 12px;
}
.ml-tab .kv {
	display: grid;
	grid-template-columns: minmax(90px, auto) minmax(0, 1fr);
	gap: 4px 12px;
	font-size: 12px;
}
.ml-tab .kv b {
	color: var(--dsw-alias-label-secondary);
	font-weight: 500;
}
.ml-tab .kv span {
	word-break: break-all;
}
.ml-tab .actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}
.ml-tab .table-wrap {
	overflow-x: auto;
}
.ml-tab table {
	width: 100%;
	border-collapse: collapse;
	font-size: 12.5px;
}
.ml-tab th {
	padding: 6px 10px 6px 0;
	border-bottom: 1px solid var(--dsw-alias-border-l2);
	color: var(--dsw-alias-label-tertiary);
	font-size: 11px;
	font-weight: 500;
	letter-spacing: 0.06em;
	text-align: left;
	text-transform: uppercase;
}
.ml-tab td {
	padding: 7px 10px 7px 0;
	border-bottom: 1px solid var(--dsw-alias-border-l1);
	vertical-align: top;
}
.ml-tab tr:last-child td {
	border-bottom: 0;
}
.ml-tab td:first-child {
	padding-left: 2px;
}
.ml-tab th:last-child,
.ml-tab td:last-child {
	padding-right: 6px;
}
.ml-tab .tiles {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
	gap: 12px;
}
.ml-tab .tile {
	padding: 12px 14px;
	background: var(--dsw-alias-bg-layer-1);
	border: 1px solid var(--dsw-alias-border-l2);
	border-radius: 10px;
}
.ml-tab .tile .n {
	font-size: 22px;
	font-weight: 600;
}
.ml-tab .tile .l {
	color: var(--dsw-alias-label-secondary);
	font-size: 12px;
}
.ml-tab .bar {
	display: grid;
	grid-template-columns: 110px minmax(0, 1fr) auto;
	align-items: center;
	gap: 10px;
	font-size: 12px;
}
.ml-tab .bar .track {
	height: 6px;
	border-radius: 999px;
	background: var(--dsw-alias-fill-l2);
	overflow: hidden;
}
.ml-tab .bar .track i {
	display: block;
	height: 100%;
	background: var(--dsw-alias-brand-primary);
}
.ml-tab .lbl {
	color: var(--dsw-alias-label-tertiary);
	font-size: 11px;
	letter-spacing: 0.06em;
	text-transform: uppercase;
}
.ml-tab .searchbar {
	display: flex;
	gap: 8px;
}
.ml-tab .searchbar input {
	flex: 1;
	min-width: 0;
	padding: 6px 10px;
	background: var(--dsw-alias-bg-layer-1);
	border: 1px solid var(--dsw-alias-border-l2);
	border-radius: 7px;
}
.ml-tab .filters {
	display: flex;
	flex-wrap: wrap;
	gap: 12px;
}
.ml-tab .filters label {
	display: grid;
	gap: 4px;
	color: var(--dsw-alias-label-tertiary);
	font-size: 11px;
	letter-spacing: 0.06em;
	text-transform: uppercase;
}
.ml-tab .filters select,
.ml-tab .filters input {
	padding: 4px 8px;
	background: var(--dsw-alias-bg-layer-1);
	border: 1px solid var(--dsw-alias-border-l2);
	border-radius: 6px;
	font-size: 12.5px;
}
.ml-tab .hit {
	grid-template-columns: minmax(120px, auto) 90px minmax(0, 1fr) auto;
	font-family: inherit;
}
.ml-tab .hit .id {
	font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.ml-tab .hit .kind {
	color: var(--dsw-alias-state-business-primary);
}
.ml-tab .hit .when {
	color: var(--dsw-alias-label-secondary);
}
.ml-tab mark {
	padding: 0 1px;
	background: var(--dsw-alias-interactive-bg-hover-accent);
	border-radius: 3px;
	color: var(--dsw-alias-brand-primary);
}
.ml-tab .meter {
	width: 90px;
	height: 6px;
	background: var(--dsw-alias-fill-l2);
	border-radius: 999px;
	overflow: hidden;
}
.ml-tab .meter i {
	display: block;
	height: 100%;
	background: var(--dsw-alias-brand-primary);
}
.ml-tab .pill {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	padding: 3px 8px;
	background: var(--dsw-alias-fill-l2);
	border: 1px solid var(--dsw-alias-border-l2);
	border-radius: 999px;
	font-size: 12px;
}
.ml-tab .pill .k {
	color: var(--dsw-alias-label-secondary);
}
.ml-tab .pill.warn {
	border-color: var(--dsw-alias-state-warn-label);
	color: var(--dsw-alias-state-warn-label);
}
.ml-tab .field {
	display: grid;
	gap: 5px;
	min-width: 0;
}
.ml-tab .field label {
	display: grid;
	gap: 5px;
	color: var(--dsw-alias-label-tertiary);
	font-size: 11px;
	letter-spacing: 0.06em;
	text-transform: uppercase;
}
.ml-tab .field input,
.ml-tab .field select,
.ml-tab .field textarea,
.ml-tab dialog textarea {
	padding: 6px 9px;
	background: var(--dsw-alias-bg-layer-2);
	border: 1px solid var(--dsw-alias-border-l2);
	border-radius: 7px;
	font-size: 13px;
	letter-spacing: normal;
	text-transform: none;
}
.ml-tab .field textarea,
.ml-tab dialog textarea {
	min-height: 64px;
	font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
	font-size: 12.5px;
	resize: vertical;
}
.ml-tab .field input:disabled,
.ml-tab .field select:disabled {
	opacity: 0.6;
}
.ml-tab .field input,
.ml-tab .field select {
	height: 34px;
}
.ml-tab .hint {
	color: var(--dsw-alias-label-dimmed);
	font-size: 11.5px;
}
.ml-tab .banner {
	margin: 0;
	padding: 8px 10px;
	border: 1px solid var(--dsw-alias-state-error-primary);
	border-radius: 7px;
	color: var(--dsw-alias-state-error-primary);
	font-size: 12.5px;
}
.ml-tab .counter {
	color: var(--dsw-alias-label-secondary);
	font-size: 11.5px;
}
.ml-tab .row2 {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	align-items: start;
	gap: 12px;
}
.ml-tab dialog {
	width: min(680px, 94vw);
	padding: 0;
	background: var(--dsw-alias-bg-layer-1);
	border: 1px solid var(--dsw-alias-border-l2);
	border-radius: 12px;
	color: var(--dsw-alias-label-primary);
}
.ml-tab dialog::backdrop {
	background: var(--dsw-alias-bg-mask-1);
}
.ml-tab dialog .head {
	padding: 14px 16px;
	border-bottom: 1px solid var(--dsw-alias-border-l1);
	font-weight: 600;
}
.ml-tab dialog form {
	display: grid;
	gap: 12px;
	padding: 14px 16px 16px;
}
.ml-tab .dlg-note {
	min-height: 16px;
	color: var(--dsw-alias-label-secondary);
	font-size: 11.5px;
}
.ml-tab .dlg-note.error {
	color: var(--dsw-alias-state-error-primary);
}
.ml-tab .dlg-foot {
	display: flex;
	justify-content: flex-end;
	gap: 8px;
	padding-top: 4px;
}
.ml-tab .status {
	position: absolute;
	left: 50%;
	bottom: 14px;
	z-index: 20;
	max-width: min(620px, 90vw);
	padding: 0;
	background: var(--dsw-alias-bg-layer-1);
	border: 1px solid transparent;
	border-radius: 8px;
	color: var(--dsw-alias-label-secondary);
	font-size: 12px;
	opacity: 0;
	pointer-events: none;
	transform: translateX(-50%);
	transition: opacity 120ms;
}
.ml-tab .status:not(:empty) {
	padding: 7px 12px;
	border-color: var(--dsw-alias-border-l2);
	opacity: 1;
}
.ml-tab .status.error {
	color: var(--dsw-alias-state-error-primary);
}
.ml-tab .status.error:not(:empty) {
	border-color: var(--dsw-alias-state-error-primary);
}
@media (max-width: 860px) {
	.ml-tab .split {
		grid-template-columns: 1fr;
	}
	.ml-tab .row2 {
		grid-template-columns: 1fr;
	}
}
`;
// #endregion CONST_TAB_CSS

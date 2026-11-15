/**
 * #region moduleContract
 * @purpose Give the memory surfaces their own stylesheet, so the shared console components read as
 *   one page inside the harness Web page and no harness style changes.
 * @scope The class names of the shared components and the primitives, the record dialog, the status
 *   line, the page head, the session state, and the panel bar. NOT: the components, the state, and
 *   the transport.
 * @invariants Each selector starts with the surface root class `.ml-console`, so no rule reaches
 *   outside a surface and no page rule reaches inside it.
 * @invariants Each colour is a harness alias token of the family `--dsw-alias-*`. The sheet holds no
 *   literal colour.
 * @invariants The sheet is a text constant. Each surface renders it in a `style` element, so the
 *   CSS leaves the page with its surface.
 * @rationale
 *  - Q: Why not reuse the standalone stylesheet? A: It holds literal colours and its own palettes.
 *    The harness page supplies the alias tokens instead.
 * @keywords client, style, css, token, alias, tab
 * #endregion moduleContract
 */

// #region CONST_CONSOLE_CSS
/**
 * @purpose Hold the stylesheet of the surfaces.
 * @invariants The rules follow the class names that the shared components and the primitives emit.
 */
export const CONSOLE_CSS = `
.ml-console {
	position: relative;
	display: flex;
	flex-direction: column;
	height: 100%;
	min-height: 0;
	background: var(--dsw-alias-bg-base);
	color: var(--dsw-alias-label-primary);
	font: 13px / 1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
.ml-console :focus-visible {
	outline: 2px solid var(--dsw-alias-brand-primary);
	outline-offset: 1px;
}
.ml-console .ml-bar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 4px 12px;
	padding: 8px 12px;
	background: var(--dsw-alias-bg-layer-1);
	border-bottom: 1px solid var(--dsw-alias-border-l2);
}
.ml-console .ml-bar-title {
	color: var(--dsw-alias-label-tertiary);
	font-size: 10px;
	text-transform: uppercase;
	letter-spacing: 0.08em;
}
.ml-console .ml-screens,
.ml-console .ml-scopes {
	display: flex;
	flex-wrap: wrap;
	gap: 4px;
	margin: 0;
	padding: 0;
	list-style: none;
}
.ml-console .ml-screen,
.ml-console .ml-scope {
	padding: 4px 8px;
	border: 1px solid transparent;
	border-radius: 6px;
	background: transparent;
	color: var(--dsw-alias-label-secondary);
	font: inherit;
	text-align: left;
	cursor: pointer;
}
.ml-console .ml-screen:hover,
.ml-console .ml-scope:hover {
	background: var(--dsw-alias-interactive-bg-hover);
	color: var(--dsw-alias-label-primary);
}
.ml-console .ml-screen.on,
.ml-console .ml-scope.on {
	background: var(--dsw-alias-interactive-bg-hover-accent);
	border-color: var(--dsw-alias-brand-primary);
	color: var(--dsw-alias-brand-primary);
}
.ml-console .ml-scope {
	font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
	font-size: 11.5px;
	word-break: break-all;
}
.ml-console .ml-new {
	margin-left: auto;
	padding: 4px 10px;
	border: 1px solid var(--dsw-alias-border-l2);
	border-radius: 6px;
	background: var(--dsw-alias-button-primary-fill);
	color: var(--dsw-alias-label-on-color);
	font: inherit;
	cursor: pointer;
}
.ml-console .ml-new:hover {
	background: var(--dsw-alias-button-primary-hover);
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
.ml-console .sub {
	margin: 0;
	max-width: 78ch;
	color: var(--dsw-alias-label-secondary);
}
.ml-console .muted {
	color: var(--dsw-alias-label-secondary);
}
.ml-console .panel {
	display: grid;
	gap: 10px;
	min-width: 0;
	padding: 12px 14px;
	background: var(--dsw-alias-bg-layer-1);
	border: 1px solid var(--dsw-alias-border-l2);
	border-radius: 10px;
}
.ml-console .panel .head {
	display: flex;
	align-items: baseline;
	justify-content: space-between;
	gap: 12px;
}
.ml-console .panel .head .t {
	font-weight: 600;
}
.ml-console .panel .head .r {
	color: var(--dsw-alias-label-secondary);
	font-size: 12px;
}
.ml-console .cards {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
	gap: 12px;
}
.ml-console .card {
	display: grid;
	gap: 8px;
	min-width: 0;
	padding: 12px 14px;
	background: var(--dsw-alias-bg-layer-1);
	border: 1px solid var(--dsw-alias-border-l2);
	border-radius: 10px;
}
.ml-console .card.active {
	border-color: var(--dsw-alias-brand-primary);
}
.ml-console .card-head {
	display: flex;
	align-items: center;
	gap: 8px;
	min-width: 0;
}
.ml-console .card-head .key {
	font-weight: 600;
	word-break: break-all;
}
.ml-console .tag {
	padding: 1px 6px;
	border-radius: 999px;
	background: var(--dsw-alias-interactive-bg-hover-accent);
	color: var(--dsw-alias-brand-primary);
	font-size: 11px;
}
.ml-console .stats {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	color: var(--dsw-alias-label-secondary);
	font-size: 12px;
}
.ml-console .mini {
	display: grid;
	gap: 4px;
	overflow: hidden;
	color: var(--dsw-alias-label-secondary);
	font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
	font-size: 11.5px;
}
.ml-console .mini div {
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
}
.ml-console .card .btn {
	justify-self: start;
}
.ml-console pre.slice {
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
.ml-console .split {
	display: grid;
	grid-template-columns: minmax(0, 1fr) minmax(280px, 0.8fr);
	align-items: start;
	gap: 14px;
}
.ml-console .column {
	display: grid;
	gap: 14px;
}
.ml-console .legend {
	display: flex;
	flex-wrap: wrap;
	gap: 12px;
	color: var(--dsw-alias-label-secondary);
	font-size: 12px;
}
.ml-console .legend .lg::before {
	content: "";
	display: inline-block;
	width: 9px;
	height: 9px;
	margin-right: 5px;
	border-radius: 2px;
	background: var(--dsw-alias-fill-l2);
	vertical-align: -1px;
}
.ml-console .legend .lg.r::before {
	background: var(--dsw-alias-state-success-primary);
}
.ml-console .legend .lg.s::before {
	background: var(--dsw-alias-brand-primary);
}
.ml-console .legend .lg.t::before {
	background: var(--dsw-alias-state-warn-primary);
}
.ml-console .lines {
	display: grid;
	gap: 3px;
}
.ml-console button,
.ml-console select,
.ml-console input,
.ml-console textarea {
	font: inherit;
	color: inherit;
}
.ml-console .btn {
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
.ml-console .btn:hover:not(:disabled) {
	border-color: var(--dsw-alias-brand-primary);
}
.ml-console .btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}
.ml-console .btn.pri {
	background: var(--dsw-alias-button-primary-fill);
	border-color: var(--dsw-alias-button-primary-fill);
	color: var(--dsw-alias-label-on-color);
}
.ml-console .btn.pri:hover:not(:disabled) {
	background: var(--dsw-alias-button-primary-hover);
	border-color: var(--dsw-alias-button-primary-hover);
}
.ml-console .btn.ghost {
	background: transparent;
}
.ml-console .btn.danger {
	border-color: var(--dsw-alias-state-error-primary);
	color: var(--dsw-alias-state-error-primary);
}
.ml-console .line {
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
.ml-console .line:hover {
	background: var(--dsw-alias-interactive-bg-hover);
}
.ml-console .line.sel {
	background: var(--dsw-alias-interactive-bg-hover-accent);
	border-color: var(--dsw-alias-brand-primary);
}
.ml-console .line .id {
	color: var(--dsw-alias-label-secondary);
}
.ml-console .keys .line .id {
	max-width: 26ch;
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
}
.ml-console .line.r .id {
	color: var(--dsw-alias-state-success-primary);
}
.ml-console .line.s .id {
	color: var(--dsw-alias-brand-primary);
}
.ml-console .line.t .id {
	color: var(--dsw-alias-state-warn-primary);
}
.ml-console .line .tx {
	overflow: hidden;
	font-family: inherit;
	white-space: nowrap;
	text-overflow: ellipsis;
}
.ml-console .line.pending .tx {
	color: var(--dsw-alias-state-warn-primary);
}
.ml-console .ins .quote {
	padding: 10px 12px;
	background: var(--dsw-alias-bg-layer-2);
	border-left: 3px solid var(--dsw-alias-border-l3);
	border-radius: 0 6px 6px 0;
	white-space: pre-wrap;
}
.ml-console .ins .quote .doc {
	margin-top: 8px;
	color: var(--dsw-alias-label-secondary);
	font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
	font-size: 12px;
}
.ml-console .kv {
	display: grid;
	grid-template-columns: minmax(90px, auto) minmax(0, 1fr);
	gap: 4px 12px;
	font-size: 12px;
}
.ml-console .kv b {
	color: var(--dsw-alias-label-secondary);
	font-weight: 500;
}
.ml-console .kv span {
	word-break: break-all;
}
.ml-console .actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}
.ml-console .table-wrap {
	overflow-x: auto;
}
.ml-console table {
	width: 100%;
	border-collapse: collapse;
	font-size: 12.5px;
}
.ml-console th {
	padding: 6px 10px 6px 0;
	border-bottom: 1px solid var(--dsw-alias-border-l2);
	color: var(--dsw-alias-label-tertiary);
	font-size: 11px;
	font-weight: 500;
	letter-spacing: 0.06em;
	text-align: left;
	text-transform: uppercase;
}
.ml-console td {
	padding: 7px 10px 7px 0;
	border-bottom: 1px solid var(--dsw-alias-border-l1);
	vertical-align: top;
}
.ml-console tr:last-child td {
	border-bottom: 0;
}
.ml-console td:first-child {
	padding-left: 2px;
}
.ml-console th:last-child,
.ml-console td:last-child {
	padding-right: 6px;
}
.ml-console .tiles {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
	gap: 12px;
}
.ml-console .tile {
	padding: 12px 14px;
	background: var(--dsw-alias-bg-layer-1);
	border: 1px solid var(--dsw-alias-border-l2);
	border-radius: 10px;
}
.ml-console .tile .n {
	font-size: 22px;
	font-weight: 600;
}
.ml-console .tile .l {
	color: var(--dsw-alias-label-secondary);
	font-size: 12px;
}
.ml-console .bar {
	display: grid;
	grid-template-columns: 110px minmax(0, 1fr) auto;
	align-items: center;
	gap: 10px;
	font-size: 12px;
}
.ml-console .bar .track {
	height: 6px;
	border-radius: 999px;
	background: var(--dsw-alias-fill-l2);
	overflow: hidden;
}
.ml-console .bar .track i {
	display: block;
	height: 100%;
	background: var(--dsw-alias-brand-primary);
}
.ml-console .lbl {
	color: var(--dsw-alias-label-tertiary);
	font-size: 11px;
	letter-spacing: 0.06em;
	text-transform: uppercase;
}
.ml-console .searchbar {
	display: flex;
	gap: 8px;
}
.ml-console .searchbar input {
	flex: 1;
	min-width: 0;
	padding: 6px 10px;
	background: var(--dsw-alias-bg-layer-1);
	border: 1px solid var(--dsw-alias-border-l2);
	border-radius: 7px;
}
.ml-console .filters {
	display: flex;
	flex-wrap: wrap;
	gap: 12px;
}
.ml-console .filters label {
	display: grid;
	gap: 4px;
	color: var(--dsw-alias-label-tertiary);
	font-size: 11px;
	letter-spacing: 0.06em;
	text-transform: uppercase;
}
.ml-console .filters select,
.ml-console .filters input {
	padding: 4px 8px;
	background: var(--dsw-alias-bg-layer-1);
	border: 1px solid var(--dsw-alias-border-l2);
	border-radius: 6px;
	font-size: 12.5px;
}
.ml-console .hit {
	grid-template-columns: minmax(120px, auto) 90px minmax(0, 1fr) auto;
	font-family: inherit;
}
.ml-console .hit .id {
	font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.ml-console .hit .kind {
	color: var(--dsw-alias-state-business-primary);
}
.ml-console .hit .when {
	color: var(--dsw-alias-label-secondary);
}
.ml-console mark {
	padding: 0 1px;
	background: var(--dsw-alias-interactive-bg-hover-accent);
	border-radius: 3px;
	color: var(--dsw-alias-brand-primary);
}
.ml-console .meter {
	width: 90px;
	height: 6px;
	background: var(--dsw-alias-fill-l2);
	border-radius: 999px;
	overflow: hidden;
}
.ml-console .meter i {
	display: block;
	height: 100%;
	background: var(--dsw-alias-brand-primary);
}
.ml-console .pill {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	padding: 3px 8px;
	background: var(--dsw-alias-fill-l2);
	border: 1px solid var(--dsw-alias-border-l2);
	border-radius: 999px;
	font-size: 12px;
}
.ml-console .pill .k {
	color: var(--dsw-alias-label-secondary);
}
.ml-console .pill.warn {
	border-color: var(--dsw-alias-state-warn-label);
	color: var(--dsw-alias-state-warn-label);
}
.ml-console .field {
	display: grid;
	gap: 5px;
	min-width: 0;
}
.ml-console .field label {
	display: grid;
	gap: 5px;
	color: var(--dsw-alias-label-tertiary);
	font-size: 11px;
	letter-spacing: 0.06em;
	text-transform: uppercase;
}
.ml-console .field input,
.ml-console .field select,
.ml-console .field textarea,
.ml-console dialog textarea {
	padding: 6px 9px;
	background: var(--dsw-alias-bg-layer-2);
	border: 1px solid var(--dsw-alias-border-l2);
	border-radius: 7px;
	font-size: 13px;
	letter-spacing: normal;
	text-transform: none;
}
.ml-console .field textarea,
.ml-console dialog textarea {
	min-height: 64px;
	font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
	font-size: 12.5px;
	resize: vertical;
}
.ml-console .field input:disabled,
.ml-console .field select:disabled {
	opacity: 0.6;
}
.ml-console .field input,
.ml-console .field select {
	height: 34px;
}
.ml-console .hint {
	color: var(--dsw-alias-label-dimmed);
	font-size: 11.5px;
}
.ml-console .banner {
	margin: 0;
	padding: 8px 10px;
	border: 1px solid var(--dsw-alias-state-error-primary);
	border-radius: 7px;
	color: var(--dsw-alias-state-error-primary);
	font-size: 12.5px;
}
.ml-console .counter {
	color: var(--dsw-alias-label-secondary);
	font-size: 11.5px;
}
.ml-console .row2 {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	align-items: start;
	gap: 12px;
}
.ml-console dialog {
	width: min(680px, 94vw);
	padding: 0;
	background: var(--dsw-alias-bg-layer-1);
	border: 1px solid var(--dsw-alias-border-l2);
	border-radius: 12px;
	color: var(--dsw-alias-label-primary);
}
.ml-console dialog::backdrop {
	background: var(--dsw-alias-bg-mask-1);
}
.ml-console dialog .head {
	padding: 14px 16px;
	border-bottom: 1px solid var(--dsw-alias-border-l1);
	font-weight: 600;
}
.ml-console dialog form {
	display: grid;
	gap: 12px;
	padding: 14px 16px 16px;
}
.ml-console .dlg-note {
	min-height: 16px;
	color: var(--dsw-alias-label-secondary);
	font-size: 11.5px;
}
.ml-console .dlg-note.error {
	color: var(--dsw-alias-state-error-primary);
}
.ml-console .dlg-foot {
	display: flex;
	justify-content: flex-end;
	gap: 8px;
	padding-top: 4px;
}
.ml-console .status {
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
.ml-console .status:not(:empty) {
	padding: 7px 12px;
	border-color: var(--dsw-alias-border-l2);
	opacity: 1;
}
.ml-console .status.error {
	color: var(--dsw-alias-state-error-primary);
}
.ml-console .status.error:not(:empty) {
	border-color: var(--dsw-alias-state-error-primary);
}
.ml-console.ml-page {
	height: 100%;
}
.ml-console .ml-head {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px 12px;
	padding: 8px 12px;
	border-bottom: 1px solid var(--dsw-alias-border-l2);
	background: var(--dsw-alias-bg-layer-1);
}
.ml-console .ml-title {
	color: var(--dsw-alias-label-primary);
	font-size: 13px;
	font-weight: 600;
}
.ml-console .ml-hspacer {
	flex: 1 1 auto;
}
.ml-console .ml-field {
	display: inline-flex;
	align-items: center;
	gap: 6px;
}
.ml-console .ml-field select {
	max-width: 220px;
	padding: 3px 6px;
	border: 1px solid var(--dsw-alias-border-l2);
	border-radius: 6px;
	background: var(--dsw-alias-bg-base);
	color: var(--dsw-alias-label-primary);
	font: inherit;
	font-size: 12px;
}
.ml-console .ml-chip {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	font-size: 12px;
	color: var(--dsw-alias-label-secondary);
}
.ml-console .ml-chip b {
	color: var(--dsw-alias-label-primary);
	font-weight: 600;
}
.ml-console.ml-session .ml-head {
	padding: 8px 12px;
}
.ml-console .ml-scoperow {
	display: flex;
	align-items: flex-start;
	gap: 8px;
	padding: 8px 12px 0;
}
.ml-console .ml-scoperow .ml-bar-title {
	padding-top: 3px;
}
.ml-console .ml-scoperow .ml-scopes,
.ml-console .ml-scoperow .ml-scopelist {
	padding: 0;
}
.ml-console .ml-scopelist {
	display: flex;
	flex-wrap: wrap;
	gap: 4px;
	max-height: 84px;
	overflow-y: auto;
}
.ml-console .ml-scope-tag {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	padding: 1px 8px;
	border: 1px solid var(--dsw-alias-border-l2);
	border-radius: 999px;
	color: var(--dsw-alias-label-secondary);
	font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
	font-size: 11px;
	word-break: break-all;
}
.ml-console .ml-scope-tag.on {
	border-color: var(--dsw-alias-brand-primary);
	color: var(--dsw-alias-label-primary);
}
.ml-console .ml-scope-tag i {
	color: var(--dsw-alias-label-tertiary);
	font-style: normal;
}
.ml-console .ml-slice-head {
	display: flex;
	justify-content: space-between;
	gap: 8px;
	padding: 12px 12px 4px;
	color: var(--dsw-alias-label-tertiary);
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
	color: var(--dsw-alias-label-secondary);
	font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
	font-size: 12px;
	line-height: 1.5;
	white-space: pre-wrap;
	word-break: break-word;
}
.ml-console .ml-muted {
	margin: 12px;
	color: var(--dsw-alias-label-tertiary);
	font-size: 12px;
}

@media (max-width: 860px) {
	.ml-console .split {
		grid-template-columns: 1fr;
	}
	.ml-console .row2 {
		grid-template-columns: 1fr;
	}
}
`;
// #endregion CONST_CONSOLE_CSS

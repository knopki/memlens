/**
 * #region moduleContract
 * @purpose Give both console shells one set of unstyled React controls that emit the class names of
 * the standalone stylesheet.
 * @scope The button, the icon button, the text input, the text area, the select, the checkbox, the
 * field, the filter bar, the panel, the key-value block, the table, the meter, the dialog, the
 * status line, the chip, and the empty state. NOT: the transport, the address, the state, and the
 * stylesheet.
 * @invariants A primitive writes its text into a text node and never into markup.
 * @invariants A primitive holds no style, no transport, and no address. The shell supplies the
 * stylesheet.
 * @invariants A primitive emits the same element and the same classes as the DOM helper that it
 * replaces.
 * @keywords component, primitive, button, panel, table, dialog, status
 * #endregion moduleContract
 */

import type { JSX, KeyboardEvent } from "react";
import { Fragment, type ReactNode, useEffect, useRef } from "react";

// #region COMPONENT_Icon
/**
 * @purpose Show one decorative navigation glyph.
 * @invariants The glyph takes no accessible name. The button around it gives the name.
 */
export interface IconProps {
	readonly path: string;
}

export function Icon({ path }: IconProps): JSX.Element {
	return (
		<svg
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			aria-hidden="true"
		>
			<path d={path} />
		</svg>
	);
}
// #endregion COMPONENT_Icon

// #region COMPONENT_Button
/**
 * @purpose Give one click target with the class of the DOM button helper.
 * @invariants The class text joins the class `btn`, so the stylesheet and the shell style it.
 * @invariants A `submit` button sends the form of the dialog.
 */
export interface ButtonProps {
	readonly text?: string;
	readonly children?: ReactNode;
	readonly onClick?: () => void;
	readonly className?: string;
	readonly type?: "button" | "submit";
	readonly disabled?: boolean;
	readonly title?: string;
}

export function Button({
	text = "",
	children,
	onClick,
	className = "",
	type = "button",
	disabled = false,
	title,
}: ButtonProps): JSX.Element {
	return (
		<button
			type={type}
			className={`btn ${className}`.trim()}
			onClick={onClick}
			disabled={disabled}
			title={title}
		>
			{text}
			{children}
		</button>
	);
}
// #endregion COMPONENT_Button

// #region COMPONENT_IconButton
/**
 * @purpose Give one icon-only button with its accessible name.
 * @invariants The name goes into the attribute `aria-label`.
 */
export interface IconButtonProps {
	readonly path: string;
	readonly label: string;
	readonly onClick?: () => void;
	readonly className?: string;
	readonly disabled?: boolean;
}

export function IconButton({
	path,
	label,
	onClick,
	className = "",
	disabled = false,
}: IconButtonProps): JSX.Element {
	return (
		<button
			type="button"
			className={`btn ${className}`.trim()}
			aria-label={label}
			onClick={onClick}
			disabled={disabled}
		>
			<Icon path={path} />
		</button>
	);
}
// #endregion COMPONENT_IconButton

// #region COMPONENT_TextInput
/**
 * @purpose Give one text input with a controlled value.
 * @invariants The value arrives through props. The caller keeps it.
 */
export interface TextInputProps {
	readonly value: string;
	readonly onChange: (value: string) => void;
	readonly type?: string;
	readonly placeholder?: string;
	readonly required?: boolean;
	readonly pattern?: string;
	readonly min?: string;
	readonly max?: string;
	readonly spellCheck?: boolean;
	readonly id?: string;
	readonly className?: string;

	/** The key handler of the field. A shell uses it for the Enter key. */
	readonly onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
}

export function TextInput({
	value,
	onChange,
	type = "text",
	placeholder,
	required = false,
	pattern,
	min,
	max,
	spellCheck,
	id,
	className,
	onKeyDown,
}: TextInputProps): JSX.Element {
	return (
		<input
			type={type}
			className={className}
			id={id}
			value={value}
			onChange={(event) => onChange(event.target.value)}
			onKeyDown={onKeyDown}
			placeholder={placeholder}
			required={required}
			pattern={pattern}
			min={min}
			max={max}
			spellCheck={spellCheck}
		/>
	);
}
// #endregion COMPONENT_TextInput

// #region COMPONENT_TextArea
/**
 * @purpose Give one text area with a controlled value.
 * @invariants The value arrives through props. The caller keeps it.
 */
export interface TextAreaProps {
	readonly value: string;
	readonly onChange: (value: string) => void;
	readonly rows?: number;
	readonly placeholder?: string;
	readonly spellCheck?: boolean;
	readonly required?: boolean;
	readonly id?: string;
	readonly className?: string;
}

export function TextArea({
	value,
	onChange,
	rows,
	placeholder,
	spellCheck,
	required = false,
	id,
	className,
}: TextAreaProps): JSX.Element {
	return (
		<textarea
			className={className}
			id={id}
			value={value}
			onChange={(event) => onChange(event.target.value)}
			rows={rows}
			placeholder={placeholder}
			spellCheck={spellCheck}
			required={required}
		/>
	);
}
// #endregion COMPONENT_TextArea

// #region COMPONENT_Select
/**
 * @purpose Give one select with the options that the caller supplies.
 * @invariants The caller supplies each option text. The primitive reads no message table.
 */
export interface SelectOption {
	readonly value: string;
	readonly label: string;
}

export interface SelectProps {
	readonly value: string;
	readonly options: readonly SelectOption[];
	readonly onChange: (value: string) => void;
	readonly id?: string;
	readonly className?: string;
}

export function Select({
	value,
	options,
	onChange,
	id,
	className,
}: SelectProps): JSX.Element {
	return (
		<select
			className={className}
			id={id}
			value={value}
			onChange={(event) => onChange(event.target.value)}
		>
			{options.map((option) => (
				<option key={option.value} value={option.value}>
					{option.label}
				</option>
			))}
		</select>
	);
}
// #endregion COMPONENT_Select

// #region COMPONENT_Checkbox
/**
 * @purpose Give one checkbox with its label.
 * @invariants The label text arrives through props.
 */
export interface CheckboxProps {
	readonly label: string;
	readonly checked: boolean;
	readonly onChange: (checked: boolean) => void;
	readonly id?: string;
	readonly disabled?: boolean;
}

export function Checkbox({
	label,
	checked,
	onChange,
	id,
	disabled = false,
}: CheckboxProps): JSX.Element {
	return (
		<label>
			<input
				type="checkbox"
				id={id}
				checked={checked}
				onChange={(event) => onChange(event.target.checked)}
				disabled={disabled}
			/>
			{label}
		</label>
	);
}
// #endregion COMPONENT_Checkbox

// #region COMPONENT_Field
/**
 * @purpose Give one labelled control with an optional hint.
 * @invariants The hint follows the label, so the stylesheet keeps the field layout.
 */
export interface FieldProps {
	readonly label: string;
	readonly hint?: string;
	readonly children: ReactNode;
}

export function Field({ label, hint, children }: FieldProps): JSX.Element {
	return (
		<div className="field">
			{/* biome-ignore lint/a11y/noLabelWithoutControl: the control arrives as a child */}
			<label>
				{label}
				{children}
			</label>
			{hint ? <div className="hint">{hint}</div> : null}
		</div>
	);
}
// #endregion COMPONENT_Field

// #region COMPONENT_FilterBar
/**
 * @purpose Give one row of labelled filters.
 * @invariants Each filter holds one label and one control.
 */
export interface Filter {
	readonly label: string;
	readonly control: ReactNode;
}

export interface FilterBarProps {
	readonly filters: readonly Filter[];
}

export function FilterBar({ filters }: FilterBarProps): JSX.Element {
	return (
		<div className="filters">
			{filters.map((filter) => (
				// biome-ignore lint/a11y/noLabelWithoutControl: the control arrives as a child
				<label key={filter.label}>
					<span>{filter.label}</span>
					{filter.control}
				</label>
			))}
		</div>
	);
}
// #endregion COMPONENT_FilterBar

// #region COMPONENT_Panel
/**
 * @purpose Give one panel with its title and its optional right text.
 * @invariants The right text states a count or a budget.
 */
export interface PanelProps {
	readonly title: string;
	readonly right?: string;
	readonly className?: string;
	readonly children?: ReactNode;
}

export function Panel({
	title,
	right = "",
	className = "",
	children,
}: PanelProps): JSX.Element {
	return (
		<section className={`panel ${className}`.trim()}>
			<div className="head">
				<span className="t">{title}</span>
				{right ? <span className="r">{right}</span> : null}
			</div>
			{children}
		</section>
	);
}
// #endregion COMPONENT_Panel

// #region COMPONENT_KeyValue
/**
 * @purpose Give one block of key and value rows.
 * @invariants Each value is a text node.
 */
export interface KeyValueProps {
	readonly rows: readonly (readonly [string, string])[];
}

export function KeyValue({ rows }: KeyValueProps): JSX.Element {
	return (
		<div className="kv">
			{rows.map(([key, value]) => (
				<Fragment key={key}>
					<b>{key}</b>
					<span>{value}</span>
				</Fragment>
			))}
		</div>
	);
}
// #endregion COMPONENT_KeyValue

// #region COMPONENT_Table
/**
 * @purpose Give one table with a header row and body rows.
 * @invariants A cell that is not text becomes a child node. An empty body states that fact.
 */
export interface TableProps {
	readonly headers: readonly string[];
	readonly rows: readonly (readonly ReactNode[])[];
	readonly empty?: string;
}

export function Table({ headers, rows, empty }: TableProps): JSX.Element {
	return (
		<div className="table-wrap">
			<table>
				<thead>
					<tr>
						{headers.map((name) => (
							<th key={name}>{name}</th>
						))}
					</tr>
				</thead>
				<tbody>
					{rows.map((row, index) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: a table row holds no identity
						<tr key={index}>
							{row.map((cell, cellIndex) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: a table cell holds no identity
								<td key={cellIndex}>{cell}</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
			{rows.length === 0 && empty ? <p className="muted">{empty}</p> : null}
		</div>
	);
}
// #endregion COMPONENT_Table

// #region FUNC_widthPercent
/**
 * @purpose Give the percent of one used limit, with a full bar at the limit.
 */
export function widthPercent(used: number, limit: number): number {
	return Math.min(100, (100 * used) / Math.max(1, limit));
}
// #endregion FUNC_widthPercent

// #region COMPONENT_Meter
/**
 * @purpose Give one meter of a used limit.
 * @invariants The inner bar carries the width of the value. The stylesheet holds the rest.
 */
export interface MeterProps {
	readonly used: number;
	readonly limit: number;
}

export function Meter({ used, limit }: MeterProps): JSX.Element {
	return (
		<div className="meter">
			<i style={{ width: `${widthPercent(used, limit)}%` }} />
		</div>
	);
}
// #endregion COMPONENT_Meter

// #region COMPONENT_Chip
/**
 * @purpose Give one small label with a value.
 * @invariants A text value takes the element `b`. Any other value becomes a child node.
 */
export interface ChipProps {
	readonly label: string;
	readonly value: ReactNode;
	readonly warn?: boolean;
}

export function Chip({ label, value, warn = false }: ChipProps): JSX.Element {
	return (
		<span className={warn ? "pill warn" : "pill"}>
			<span className="k">{label}</span>
			{typeof value === "string" ? <b>{value}</b> : value}
		</span>
	);
}
// #endregion COMPONENT_Chip

// #region COMPONENT_EmptyState
/**
 * @purpose State that a list holds no item.
 * @invariants The text arrives through props.
 */
export interface EmptyStateProps {
	readonly text: string;
}

export function EmptyState({ text }: EmptyStateProps): JSX.Element {
	return <p className="muted">{text}</p>;
}
// #endregion COMPONENT_EmptyState

// #region COMPONENT_StatusLine
/**
 * @purpose Show the one status text of the page.
 * @invariants The text goes into a text node. The error class marks a failed action.
 */
export interface StatusLineProps {
	readonly text: string;
	readonly error?: boolean;
}

export function StatusLine({
	text,
	error = false,
}: StatusLineProps): JSX.Element {
	return (
		<div
			id="status"
			role="status"
			aria-live="polite"
			className={error ? "error" : ""}
		>
			{text}
		</div>
	);
}
// #endregion COMPONENT_StatusLine

// #region COMPONENT_Dialog
/**
 * @purpose Show one modal record form with its title, its note row, and its footer.
 * @invariants Escape closes the dialog. The first input, text area, or select takes the focus.
 * @invariants The shell gives the status text as the note of the dialog while the dialog is open.
 * @invariants The dialog uses the native dialog element API and no other DOM call.
 */
export interface DialogProps {
	readonly open: boolean;
	readonly title: string;
	readonly note?: string;
	readonly noteError?: boolean;
	readonly onClose: () => void;
	readonly onSubmit?: () => void;
	readonly children?: ReactNode;
	readonly footer?: ReactNode;
}

export function Dialog({
	open,
	title,
	note = "",
	noteError = false,
	onClose,
	onSubmit,
	children,
	footer,
}: DialogProps): JSX.Element {
	const ref = useRef<HTMLDialogElement>(null);
	useEffect(() => {
		const node = ref.current;
		if (!node) return;
		if (open && !node.open) {
			node.showModal();
			node.querySelector<HTMLElement>("input, textarea, select")?.focus();
		} else if (!open && node.open) {
			node.close();
		}
	}, [open]);
	return (
		<dialog
			ref={ref}
			onCancel={(event) => {
				event.preventDefault();
				onClose();
			}}
			onClose={onClose}
		>
			<div className="dlg-head">
				<span className="t">{title}</span>
			</div>
			<form
				onSubmit={(event) => {
					event.preventDefault();
					onSubmit?.();
				}}
			>
				{children}
				<div className={noteError ? "dlg-note error" : "dlg-note"}>{note}</div>
				<div className="dlg-foot">{footer}</div>
			</form>
		</dialog>
	);
}
// #endregion COMPONENT_Dialog

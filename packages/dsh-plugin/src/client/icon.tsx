/**
 * #region moduleContract
 * @purpose Draw the panel icon of the memory page, so the left side panel holds one recognisable
 *   entry.
 * @scope The one glyph, its stroke, and its two presentation values. NOT: the sidebar row, its
 *   label, and the page.
 * @invariants The glyph takes the text colour of the row, so the theme tokens colour it.
 * @invariants A selected panel draws a thicker stroke. The size is the square edge of the row.
 * @dependencies USES TYPE: the panel icon props of the client context.
 * @keywords client, icon, panel, sidebar, glyph, stroke
 * #endregion moduleContract
 */

import type { JSX } from "react";
import type { PanelIconProps } from "./context.js";

// #region COMPONENT_MemoryPanelIcon
/**
 * @purpose Draw the lens glyph of the memory page.
 * @param props - The square edge and the selection state of the panel row.
 */
export function MemoryPanelIcon({ size, active }: PanelIconProps): JSX.Element {
	const stroke = active ? 2.2 : 1.8;
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			aria-hidden="true"
			focusable="false"
			data-active={active ? "true" : undefined}
		>
			<circle
				cx="10.5"
				cy="10.5"
				r="6.5"
				stroke="currentColor"
				strokeWidth={stroke}
			/>
			<path
				d="M15.5 15.5 21 21"
				stroke="currentColor"
				strokeWidth={stroke}
				strokeLinecap="round"
			/>
		</svg>
	);
}
// #endregion COMPONENT_MemoryPanelIcon

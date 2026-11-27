/**
 * #region moduleContract
 * @purpose Find notes by words or by filters, and open one hit.
 * @scope The words, the six filters, the hit count, the hit rows, the highlight, and the
 * inspector. NOT: the search call, the transport, and the address.
 * @invariants The filter drafts start from the search filters of the API state, so a restored
 * address shows its own values.
 * @invariants A hit body goes into text nodes. The words of the query mark the matches.
 * @invariants A hit address splits into the scope prefix and the position, so the column cuts the
 * prefix and keeps the position.
 * @keywords search, find, hit, filter, kind, due, highlight, scope, react
 * #endregion moduleContract
 */

import type { IndexHit, NoteKind } from "@memlens/core";
import { dayOf, NOTE_KINDS } from "@memlens/core/view";
import {
	type JSX,
	type ReactNode,
	useState,
	useSyncExternalStore,
} from "react";
import { kindName } from "../../format.js";
import type { ConsoleApi, ConsoleState } from "../../model/console.js";
import { Inspector } from "../inspector.js";
import { Button, FilterBar, Panel, Select, TextInput } from "../primitives.js";
import type { ScreenProps } from "../screen-props.js";

// #region FUNC_formKey
/** @purpose Give the key that starts the filter form of the search again. */
function formKey(state: ConsoleState): string {
	return `${state.generation}:${state.model?.scope ?? ""}`;
}
// #endregion FUNC_formKey

// #region COMPONENT_Search
/**
 * @purpose Find notes by words in the selected scope or in every visible scope.
 * @invariants The form starts again at each view load, so a restored address shows its own values.
 * A submit loads no view, so the form keeps the focus.
 */
export function Search({ api }: ScreenProps): JSX.Element {
	const state = useSyncExternalStore(
		api.subscribe,
		() => api.state,
		() => api.state,
	);
	return <SearchScreen key={formKey(state)} api={api} />;
}
// #endregion COMPONENT_Search

// #region COMPONENT_SearchScreen
/**
 * @purpose Hold the filter drafts of the search screen.
 * @invariants The drafts start from the state. The submit step writes the seven filters to the API.
 * @invariants After a submit, the limit draft takes the limit of the state, so the field shows
 *   the limit that the search used. A draft that changed during the search stays.
 * @invariants The kind buttons toggle one kind each, so the search takes any set of kinds.
 */
function SearchScreen({ api }: ScreenProps): JSX.Element {
	const state = api.state;
	const model = state.model;
	const t = api.t;
	const [query, setQuery] = useState(state.query);
	const [kinds, setKinds] = useState<readonly NoteKind[]>(state.kinds);
	const [since, setSince] = useState(state.since);
	const [until, setUntil] = useState(state.until);
	const [due, setDue] = useState(state.due);
	const [limit, setLimit] = useState(state.limit);
	const [scope, setScope] = useState(state.searchScope ?? model?.scope ?? "");
	const submit = (): void => {
		const sent = limit;
		void api.call
			.search({
				query,
				kinds,
				since,
				until,
				due,
				limit,
				searchScope: scope,
			})
			.then(() => {
				// The controller can give the limit another value, for example the cap of the search.
				// The field then shows the limit that the search used. A newer draft stays.
				const used = api.state.limit;
				setLimit((draft) => (draft === sent ? used : draft));
			});
	};
	const toggle = (kind: NoteKind): void => {
		setKinds(
			kinds.includes(kind)
				? kinds.filter((item) => item !== kind)
				: [...kinds, kind],
		);
	};
	const scopeOptions = [
		{ value: "", label: t("allScopes") },
		...(model?.scopes ?? []).map((item) => ({
			value: item.key,
			label: item.key,
		})),
	];
	return (
		<>
			<p className="sub">{t("searchText")}</p>
			<div className="searchbar">
				<TextInput
					value={query}
					onChange={setQuery}
					spellCheck={false}
					placeholder={t("searchText")}
					onKeyDown={(event) => {
						if (event.key === "Enter") {
							event.preventDefault();
							submit();
						}
					}}
				/>
				<Button text={t("find")} className="pri" onClick={submit} />
			</div>
			<FilterBar
				filters={[
					{
						label: t("scope"),
						control: (
							<Select
								value={scope}
								options={scopeOptions}
								onChange={setScope}
							/>
						),
					},
					{
						label: t("kindLabel"),
						control: (
							<div className="kinds">
								{NOTE_KINDS.map((kind) => (
									<Button
										key={kind}
										text={kindName(t, kind)}
										className={kinds.includes(kind) ? "on" : ""}
										pressed={kinds.includes(kind)}
										onClick={() => toggle(kind)}
									/>
								))}
							</div>
						),
					},
					{
						label: t("since"),
						control: (
							<TextInput type="date" value={since} onChange={setSince} />
						),
					},
					{
						label: t("until"),
						control: (
							<TextInput type="date" value={until} onChange={setUntil} />
						),
					},
					{
						label: t("dueOnly"),
						control: (
							<input
								type="checkbox"
								checked={due}
								onChange={(event) => setDue(event.target.checked)}
							/>
						),
					},
					{
						label: t("limit"),
						control: (
							<TextInput
								type="number"
								value={limit}
								onChange={setLimit}
								min="1"
								max="50"
							/>
						),
					},
				]}
			/>
			<div className="split">
				<Panel
					title={t("matches", { count: state.hits.length })}
					right={scope || t("allScopes")}
				>
					<div className="lines">
						{state.hits.map((hit) => (
							<HitRow key={hit.addr} api={api} hit={hit} />
						))}
						{state.hits.length ? null : (
							<p className="muted">{t("noMatches")}</p>
						)}
					</div>
				</Panel>
				{state.selection ? (
					<Inspector api={api} />
				) : (
					<Panel title={t("inspector")} className="ins">
						<p className="muted">{t("selectLine")}</p>
					</Panel>
				)}
			</div>
		</>
	);
}
// #endregion COMPONENT_SearchScreen

// #region COMPONENT_HitRow
/**
 * @purpose Show one hit and open its target.
 * @invariants The selected hit takes the sel class.
 * @invariants The address is two spans: the scope prefix and the position. The column gives the
 * prefix a cut and the position a free space, so a long address keeps the position.
 */
interface HitRowProps {
	readonly api: ConsoleApi;
	readonly hit: IndexHit;
}

function HitRow({ api, hit }: HitRowProps): JSX.Element {
	const selected = api.state.selection?.target === hit.addr;
	const cut = hit.addr.lastIndexOf("#");
	return (
		<Button
			className={selected ? "line hit sel" : "line hit"}
			onClick={() => void api.call.openTarget(hit.addr)}
		>
			<span className="id">
				<span className="scope">
					{cut < 0 ? hit.addr : hit.addr.slice(0, cut)}
				</span>
				<span className="pos">{cut < 0 ? "" : hit.addr.slice(cut)}</span>
			</span>
			<span className="kind">{kindName(api.t, hit.kind)}</span>
			<span className="tx">{highlighted(hit.body, api.state.query)}</span>
			<span className="when">{dayOf(hit.ts)}</span>
		</Button>
	);
}
// #endregion COMPONENT_HitRow

// #region FUNC_highlighted
/**
 * @purpose Split one note body into text nodes and the matching words of the query.
 * @invariants The text stays text. Each match takes the mark element.
 */
function highlighted(text: string, words: string): ReactNode[] {
	const tokens = words.toLocaleLowerCase().split(/\s+/).filter(Boolean);
	const lower = text.toLocaleLowerCase();
	const parts: ReactNode[] = [];
	let offset = 0;
	while (offset < text.length) {
		const match = tokens
			.map((word) => ({ at: lower.indexOf(word, offset), word }))
			.filter((item) => item.at >= 0)
			.sort((a, b) => a.at - b.at)[0];
		if (!match) {
			parts.push(text.slice(offset));
			break;
		}
		parts.push(
			text.slice(offset, match.at),
			<mark key={match.at}>
				{text.slice(match.at, match.at + match.word.length)}
			</mark>,
		);
		offset = match.at + match.word.length;
	}
	return parts;
}
// #endregion FUNC_highlighted

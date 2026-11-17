# Glossary

One term has one meaning in all documents and in all code. This file is also the terminology base
for ASD-STE100 rule 1.8. The project approves each technical noun in this table.

| Term                 | Meaning                                                                                                                                                                      |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| memlens              | The project in this repository: a headless library, a CLI frontend, and a DSH plugin.                                                                                        |
| requirement          | A testable rule about system behavior. The REQ lists retired into docs/spec/archive. Implemented local rules live in code contracts without those identifiers. |
| behavior feature     | A Gherkin file in docs/features. It states one capability across modules as scenarios. |
| scenario             | One user-visible property of a behavior feature in the Given, When, Then form. A tag marks its state, for example `@wip` or `@disputed`. |
| module contract      | The contract at the start of a source file. Its invariants define rules that apply throughout the module.                                                                    |
| entity contract      | A contract beside a function, method, class, or type. It defines the local rules of that entity.                                                                             |
| constraint           | A limit that comes from the customer or from the environment, with an identifier `C-nnn`.                                                                                    |
| non-goal             | An item that the project does not do, with an identifier `NG-nnn`.                                                                                                           |
| open question        | An item without an answer, with an identifier `Q-nnn`.                                                                                                                       |
| headless             | Without a user interface. Other programs start the function.                                                                                                                 |
| library              | The package with the main function. It has no terminal interface and no plugin interface.                                                                                    |
| frontend             | The part that gives access to the library for a user or for a program. The project has a CLI frontend and a plugin frontend.                                                 |
| CLI                  | Command line interface. The user starts the function from a terminal.                                                                                                        |
| harness              | DeepSeek Harness (DSH), the agent harness that loads the plugin.                                                                                                             |
| plugin               | The package that the harness loads. The plugin gives access to the library from the harness.                                                                                 |
| bundle               | The installable set of plugin rows for the harness. This package has one row.                                                                                                |
| bundle patch         | The file `cordis.patch.yml`. It adds the plugin row to the harness configuration.                                                                                            |
| workspace            | The unit of the harness that holds one directory. Its id has the form `ws_01H…`, and the rules of `[scope_default]` match it.                                                |
| localization         | The translation of the product text for one language. The scope of the term is open.                                                                                         |
| STE                  | ASD-STE100 Simplified Technical English, the writing standard of this project.                                                                                               |
| GRACE-lite           | The project standard for code markup: one module contract for each file and one region for each public or non-trivial entity.                                                |
| LDD                  | Log driven development. The code writes short debug messages with key-value data. The messages act as observable contracts.                                                  |
| native compiler      | TypeScript 7. The binary is `tsc`. The preview name was `tsgo`.                                                                                                              |
| note                 | One curated fact in the memory. The store keeps it as one note row with a `body` and a `longform`.                                                                           |
| body                 | The short text of a note. It becomes a leaf of the tree. The target size is 384 characters.                                                                                  |
| longform             | The full document of a note. The size limit is 16 384 characters. It does not enter the tree.                                                                                |
| retelling            | A short text that covers the notes below a node. The tree is a set of retellings.                                                                                            |
| tree                 | The set of node rows above the notes. The store rebuilds a node row from the notes.                                                                                          |
| direction line       | One line of the map: the keys, the idle time, and the summary. A line above one scope joins its keys and gives the range of their idle times.                                |
| directions section   | The one `<directions>` section of the slice. It holds the derived scope list.                                                                                                |
| catalog              | The map of the scopes of a profile under the directions budget. The store derives it, and no catalog tree and no catalog scope exist.                                        |
| scope                | The unit of visibility and of write permission. A scope is a key of the note rows, and the store holds no record for it. A scope has a name only.                            |
| profile              | The unit that ties a set of scopes to one configuration section and one preset. The preset key `profile` names it.                                                           |
| preset               | The plugin entry `@memlens/dsh-plugin/preset`, with name `memlens/preset`. It gives the config of an agent preset. The key `profile` has the default `default`.              |
| slice                | The text that the agent gets: one `<memory>` section with the policy text, `<directions>`, and `<here>`.                                                                     |
| snapshot             | One render of the slice from the store. The harness session history keeps its text as a runtime context message.                                                             |
| store                | The memory storage: one SQLite database with note, node, proposal, and journal rows. It has one store identity.                                                              |
| hide                 | The op that takes a note out of the view. The agent can hide a note.                                                                                                         |
| redact               | The op that clears the content of a note for good. Only the CLI or the GUI can redact.                                                                                      |
| amend                | The op that changes the content, the scope, the kind, or the supersedes of a note. Only the CLI or the GUI can amend.                                                        |
| proposed             | The state of a note that waits for a human decision. A subagent write and a write outside the profile give it.                                                               |
| nudge                | The reminder that the harness gives the agent to write a note. The `[nudge]` section gives the counts and the text.                                                          |
| review               | The check of a note by a human. The `review` event records it, and `review_at` gives the time of the next check.                                                             |
| review period        | The number of days after a write when the record is due for review. The `review` section of the config gives it.                                                             |
| modified_at          | The `at` of the latest event that affects the record. It moves on a write, an amend, a hide, a redact, a review, and a supersedes of the record.                             |
| «Линза»              | The Russian name of the project. `memlens` joins memory and lens, and the lens gives the zoom into the tree.                                                                 |
| frontier             | The visible lines of the tree from the oldest level to the newest record. It tiles its range.                                                                                |
| level                | One row of the tree. A level has a fixed width, and one level covers 2^k leaves.                                                                                             |
| pair                 | Two children that the node above joins.                                                                                                                                      |
| shrink check         | The rule that a retelling must be shorter than its source.                                                                                                                   |
| compaction           | The process that builds a dirty node into a summary with model calls. It runs in the background.                                                                           |
| supersede            | A newer note hides an older note and takes the link `superseded_by`. A merge keeps the link.                                                                         |
| ULID                 | The identifier format of a note. It is unique, and it sorts by time.                                                                                                         |
| pos                  | The slot of a note: the rank of its `(ts, id)` key over the note rows of its scope. A hidden note keeps its slot.                                                            |
| target               | The field of an op that names the record or the proposal for a change.                                                                                                       |
| kind                 | The class of a note: `decision`, `preference`, `fact`, `task`, or `note`.                                                                                                    |
| `live`               | The state of a record after a write with no proposal.                                                                                                                        |
| `deleted`            | The state after redaction, including evidence from a sanitized note or amendment.                                                                                            |
| ts                   | The content date of a note. An amend never changes it.                                                                                                                       |
| record               | One note as a reader sees it: the row with its content, its state, and its times.                                                                                            |
| `record state`       | The lifecycle value of a note row, in the order `live`, `hidden`, `deleted`.                                                                                                 |
| hidden               | The state of a record after a `hide` event. The content stays.                                                                                                               |
| cleared              | The flag of a redacted note row. A cleared row keeps no content, and no merge restores it.                                                                                   |
| superseded_by        | The field of a record that names the note that superseded it.                                                                                                                |
| dirty                | The state of a range with no valid node. The render gives the text of its children.                                                                                          |
| node                 | One summary row of the tree. It covers the slot range `[start, start + 2^level)` for a level of 1 or more.                                                                   |
| top node             | The node row at the top of the tree of a scope. It gives the direction line of that scope.                                                                                   |
| summary              | The text of one node. The target size is 512 characters and the limit is 640 characters.                                                                                     |
| leaf                 | One record at the bottom of the tree. The tree holds no node of level 0.                                                                                                     |
| child                | A node or live record in one half of a parent range. Null denotes an empty half. A change makes the parent dirty.                                                            |
| budget               | The line limits of one profile: `here` and `directions`. The two are independent.                                                                                            |
| subagent mode        | The access of a subagent: `propose` writes and reports, `read` reads only, `off` has no tool and no slice.                                                                   |
| here                 | The tree slice of the active scope. The budget `here` limits this part.                                                                                                      |
| directions           | The tree slice of the catalog. The budget `directions` limits this part.                                                                                                     |
| view                 | The tiling of the frontier that the agent reads. The store derives it from rows, and it holds no projection.                                                                 |
| fold                 | The pass that merges only until rendered lines fit the budget. Unready summaries give temporary lines, with no model call.                                                   |
| line                 | One item of the view: a record, a node, or a temporary line.                                                                                                                 |
| range                | The positions under one line: `2^level` positions from `start`.                                                                                                              |
| due                  | The priority of a pair: `(total - (start + 2^(level+1) - 1)) / 2^level`. The fold and the rebuild use it.                                                                    |
| due filter           | The filter of `memory_find` that gives the records with a review time of now or earlier. It is no priority.                                                                  |
| epoch                | The clock value of the store. A long-lived reader refetches when it changes.                                                                                                 |
| reason               | The cause of a `hide`, `redact`, `dismiss`, or `forget` event.                                                                                                               |
| `job`                | One computed dirty range that a compaction attempts. It has no persistent queue row or lease.                                                                                |
| `backoff`            | The local retry wait after a failed attempt: ten, sixty, then three hundred seconds. A restart clears it.                                                                    |
| `ancestor`           | A node above another node in a tree. A change of a child makes each ancestor dirty.                                                                                          |
| batch                | The input count of one compaction call. The default is 10, and the value is a whole number above zero. The key sets no upper limit.                                          |
| scope key            | The key of a scope: two segments separated by a colon, and each segment holds lowercase text.                                                                                |
| scope name           | The second part of a scope key: lowercase letters, digits, the period, the underscore, the slash, and the hyphen.                                                            |
| wildcard             | The part `*` of a scope key. It matches any text of the kind or of the name.                                                                                                 |
| address              | The pointer to one note or one range: `pos`, `pos-pos`, `scope#pos`, or `scope#pos-pos`.                                                                                     |
| active scope         | The scope of the current workspace. A rule of `[scope_default]` gives it, and the source list applies with no match.                                                         |
| scope rule           | One entry of `rules`: a match type, a glob or an id, and a key.                                                                                                              |
| scope default        | The section `[scope_default]`: the rules and the fallback key.                                                                                                               |
| placeholder          | The part `{repo}` of a rule key. The resolver replaces it with a part of the match.                                                                                          |
| render form          | The address with a leading `#`. The renderer writes it, and the tool strips it.                                                                                              |
| runtime context      | The model-visible user-role message that the harness builds from `systemPrompt.context`. The session history keeps it.                                                       |
| policy text          | The static instruction text at the head of `<memory>`. The slice holds it whole.                                                                                             |
| `customPrompt`       | The template that replaces the slice template. The placeholders apply in it. The profile patch gives it.                                                                     |
| `customPromptAppend` | The text that takes the place of `{{append}}` in the template. The profile patch gives it.                                                                                   |
| defaultProfile       | The profile of the general config. The preset `profile` wins over it.                                                                                                        |
| language             | The language that the prompt recommends to the agent for the notes. The default is `en`, because the FTS support is better.                                                  |
| eight languages      | The set `de`, `en`, `es`, `fr`, `ja`, `pt`, `ru`, and `zh`. The product, the README files, and the user documents hold the set, and English is the default and the fallback. |
| agent preset         | The harness composition that selects the child plugins and the config of one agent.                                                                                          |
| profile patch        | The plugin row in `cordis.patch.yml` of a harness profile. It gives the config for the agents of that profile.                                                               |
| memory_note          | The tool that saves one note. Its parameters are `body`, `longform`, `scope`, `kind`, `supersedes`, `reviewIn`, and `ts`.                                                     |
| memory_find          | The tool that searches the notes by words and gives the matching lines.                                                                                                      |
| memory_forget        | The tool that hides records from the map. It takes `targets`, `scope`, and `reason`.                                                                                         |
| memory_open          | The tool that gives a note and its longform, or the non-empty child lines of a node.                                                                                         |
| memory_review        | The tool that gives the records due for review and sets a new review date. It takes `scope`, `reviewed`, and `reviewIn`.                                                     |
| memory_map           | The tool that lists the visible scopes, or gives the tree slice of one scope. It takes `scope`.                                                                              |
| visible scope        | A scope in the `scopes` list of the profile. A scope outside the list is invisible.                                                                                          |
| write scope          | The scope of a write with no `scope` field. The profile gives it. See Q-099.                                                                                                 |
| proposal line        | The line in the report of the parent about one proposal of the child.                                                                                                        |
| UI core              | The view models of the console in the core library. It holds no DOM, no transport, and no style.                                                                             |
| proposal             | A local row that names a write for a human decision. An accept applies the payload, and a dismiss closes the row.                                                            |
| pending proposal     | An open proposal row that no accept and no dismiss closed.                                                                                                                   |
| tokenizer            | The FTS5 search tokenizer of the index. It follows the key `language`.                                                                                                       |
| how-to               | The section of the slice that holds the policy text and the append text.                                                                                                     |
| build input          | The exact child values that a build copies before its model call. The store compares them again before the publish.                                                          |
| total                | One plus the greatest assigned position, or zero when no position exists. Records in the `hidden` and `deleted` states keep their positions.                                 |
| root range           | The aligned range that starts at zero and covers every assigned position. Empty padding completes its power-of-two width.                                                    |
| jump                 | The sum of max(0, parent_level - 1 - neighbor_level) over the outer neighbors of a fold pair.                                                           |
| console              | The screen set that a human uses to read and maintain the memory. The command `memlens ui` hosts it, and the plugin page hosts it in the side panel.                                          |
| side panel           | The left area of the harness window. The plugin console opens there under one menu entry.                                                                                    |
| theme                | The page colors of the console: light, dark, or the setting of the system. The choice survives a reload.                                                                     |
| message table        | The text of one language of the console. Every table holds every English key.                                                                                                |
| temporary line       | One line of a range without a ready summary. Its text comes from the two child bodies, and the render stores no such node.                                                   |
| bundle row           | One plugin entry in the harness configuration. A bundle row has an identifier and a module name.                                                                             |
| note row             | One row of the notes table. It holds the content, the slot, the state, and the versions of one note.                                                                         |
| node row             | One row of the nodes table. It holds the summary of one aligned range and the validity keys of its halves.                                                                   |
| slot                 | The integer position of a note inside its scope. It equals the rank of the `(ts, id)` key over all note rows.                                                                |
| version              | One text `physical\|counter\|store_id` of the hybrid logical clock. Text order gives the total order.                                                                          |
| store id             | The one identity in `meta` that breaks each version tie. A copied file keeps it until a caller writes a new one.                                                                   |
| merge channel        | One mergeable field group of a note row. Five exist: content, lifecycle, cleared, review, and the supersede link.                                                            |
| tombstone            | A deleted note row. It keeps the id, the date, the state, and the versions, and it holds no content.                                                                         |
| validity key         | The value a node row stores for one half: `v_content\|state` of a leaf or the `built_v` of a child row.                                                                      |
| built_v              | The version of the build of a node row. It gives priority and diagnostics, and it never decides correctness.                                                                 |
| audit journal        | The local table of facts about writes: op, target, scope, store, and a short reason. It holds no content.                                                                    |
| search               | The FTS5 query over the note rows. It gives each hit with its address, and it holds no truth.                                                                                |

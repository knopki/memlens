# DSH plugin plan

Status: stage 1 implemented, 2026-11-14. Context, tools, and background work remain pending.

## Goal and boundary

Make the existing plugin expose Memlens through DSH. Start with registration and configuration, then add context and tools.
Leave the plugin console for a later change. Keep the standalone console as it is.

The [requirements](spec/02-requirements.md), [configuration types](spec/config.d.ts), and [tool types](spec/tools.d.ts) define the product surface.
The [architecture](spec/06-architecture.md) identifies the current implementation and the pending behavior.

Keep the package `@memlens/dsh-plugin`. Import memory operations from `@memlens/core`.
Keep DSH dependencies outside the core library. Do not import CLI command handlers into the plugin.
Use the existing package structure, build tools, and tests. Add no service framework or persistent job queue.

## Starting state

At plan start, the plugin exported its name and an empty `apply` function. Its bundle patch inserted one row.
The package had no core dependency, configuration schema, preset export, runtime context, or memory tool.
The tests checked the package shape and exports only.

The core exports configuration loaders, scope selection, context rendering, store reads and writes, proposals, and a compaction pass.
The host still must supply DSH registration, session state, timers, and model calls.

## Execution order

### 1. Registration and configuration

Implemented: host and preset entries, strict schemas, shared configuration defaults, scope resolution, model checks, and store disposal.
The tests use Cordis Loader and DSH scopes at version `0.2.2-rc.3`. The older version boundary remains unverified.
See [0022 Plugin configuration](adr/0022-plugin-configuration.md).

Read the exact DSH contracts before each registration. The installed reference version is `0.2.2-rc.3`.
The accepted compatibility requirement also includes `0.2.1` prereleases. A check on the installed version alone proves no older compatibility.

Implement the host entry and the `./preset` entry. Resolve the bundle row ids against REQ-028.
Keep the package name separate from the bundle row id and the exported plugin name.

Expose the patch configuration and the preset configuration through DSH schemas.
Use the core loaders and merge rules for the base file, profile patch, and preset.
Resolve the profile, store path, budgets, and active scope for each agent.
Reject unknown keys, missing profiles, and invalid values before the agent uses memory.
Check the model context limit through the DSH model metadata.

Keep one resource owner for each open store. Close the store when that owner ends.
Keep registrations and resource cleanup under Cordis effects.
For each agent registration, retain its disposer under both the plugin context and the agent context.

Acceptance: a real DSH composition loads the built entries, resolves two distinct presets, and disposes its resources.
Tests cover configuration precedence, invalid configuration, and the built package contents.
This stage requires no browser page and no model call.

### 2. Memory context

Register one runtime context for each agent. Use `required: true`, `interpolate: false`, and order `220`.
The harness combines named sections in one runtime context message. Restore only the Memlens section from the current session surface.
Render the slice through the core. Read the previous snapshot from the harness session history.
Keep the snapshot text stable across turns, writes, summary builds, and process restarts.
Refresh it at the accepted triggers: a fresh session, successful harness compaction, and idle time above the model TTL.
Measure the idle interval from session activity. A snapshot timestamp does not measure session inactivity.
A refresh with identical text needs no new message. The harness owns snapshot publication and replacement.
Keep the snapshot in the harness history. Add no snapshot table to Memlens.
Apply the subagent mode before the context registration. The `off` mode receives no memory context.

Acceptance: two sessions keep separate snapshots. A restart preserves the exact text.
A write leaves the current snapshot unchanged. Each refresh trigger produces the expected snapshot.
The memory context remains present when the harness disables optional runtime context.
A render calls no model and waits for no summary build.

### 3. Agent tools

Implement the six accepted tools with their existing input and output types.
Start with `memory_find`, `memory_open`, and `memory_map`. Then add `memory_note`, `memory_forget`, and `memory_review`.
Share the resolved profile and active scope with the context provider.
Use core operations for address parsing, reads, writes, review dates, and proposals.
Keep profile visibility checks at every tool boundary.

Register the tool set in the context of its agent.
The main agent receives all six tools.
A child in `propose` receives find, open, map, and note. Its note creates a proposal.
A child in `read` receives find, open, and map. A child in `off` receives no memory tool.
No child receives forget or review.

Store the child session id beside the proposed note fields in the existing JSON payload.
Use that id to collect the proposals of one child for its parent.
Keep the operation fields at the top of the payload, because console approval reads them there.
Use proposal ids and bodies for the parent report. A new-note proposal has no record address.
Deliver the proposal lines through separate injected context when the child ends. Keep the child result intact.
Use the tool output renderer for the child message, `Proposed to your parent: ...`.
Keep the canonical value equal to the declared output type.
The parent applies a suggestion through an ordinary note write.
Expose no amend, redact, accept, or dismiss tool.

Acceptance: test each tool result against its declared shape.
Test the main agent and all three child modes through actual tool registration.
Test foreign scopes, qualified addresses, numeric review targets, proposal reports, and two agents with different profiles.

### 4. Nudge and background work

Add the two nudge counters through the accepted injected context surface.
Reset both counters after a note write or a nudge. Keep nudge text outside the memory snapshot.

Connect the existing compaction pass to the configured DSH LLM service.
Start work at the dirty threshold and idle timeout. Keep call limits, retry state, and in-flight work local.
Use one worker owner for each store. Dispose timers and prevent late writes after disposal.
Call the existing proposal sweep at the write boundary.

Acceptance: fake time proves the counter, idle, and retry behavior.
A controlled LLM proves provider and model selection without a paid request.
A failed build leaves the range dirty. A changed input rejects a late answer.
A read still returns immediately. Plugin disposal leaves no active timer or worker.

### 5. Package and compatibility checks

Complete backend configuration text and package instructions in the eight required languages.
Keep public names stable. Declare runtime dependencies and include every built entry in the package.
Run focused tests for each stage. Run `pnpm run format` and `pnpm run verify` before each implementation handoff.
Inspect the packed artifact and load it in an isolated DSH profile.
Check both the installed DSH version and the accepted lower version boundary.
Report unsupported or untested version boundaries explicitly.

Acceptance: the built package completes agent start, memory context, tool call, result, session reload, and plugin disposal.
Keep credentials and paid model calls outside the automatic checks.

## Delegation and integration

| Owner | Owned work | Boundary |
| --- | --- | --- |
| Entry agent | Manifest, bundle patch, build, host entry, preset entry, configuration | No context provider or tool handlers. |
| Context agent | Snapshot lifecycle, session history, runtime context | No manifest, configuration parser, or tool writes. |
| Tools agent | Tool schemas, handlers, child modes, proposal reports | No context snapshot lifecycle or build changes. |
| Lead | Shared contracts, integration, background work, final checks | Resolve shared edits before agents write. |

Each implementation agent must load `grace-lite`, `ponytail`, `dsh-doc`, and `plugin-write`.
Each agent must read the relevant module contracts before a change.
The entry agent alone edits existing package files during stage 1.
After stage 1, the lead owns entry wiring and shared configuration changes.
The context agent and tools agent own separate source modules and their respective tests.
The lead defines shared inputs after stage 1. Later agents consume those inputs without editing their owner modules.
If a shared contract must change, the lead makes that change before parallel work continues.

## Decisions and checks before implementation

The customer removed `hidden`, `rebuildsQueued`, and `topNodesQueued` from the `memory_forget` result on 2026-11-14.
A successful call returns `{}`. The tool renderer gives a short confirmation, and errors retain their specific cause.
The [tool types](spec/tools.d.ts) and REQ-371 define this result.
Keep an out-of-profile hide as a proposal. Do not expose a hidden count through another field.

Keep the bundle row id `memlens`, the plugin name `dsh-memlens`, and the package name `@memlens/dsh-plugin` distinct.
The preset module specifier is `@memlens/dsh-plugin/preset`. It uses the package export `./preset`.
The host and preset entries need one shared configuration source. Prove that connection in the stage 1 composition test.
Use one small Cordis service if the preset needs access to the host configuration. Do not build a separate service package.

## Deferred work

The plugin console, browser routes, and visual checks remain outside these stages.
The pending import from harness sessions also remains outside this plan.
The existing open questions about import, store identity, tokenizer changes, and incremental export do not block stage 1.

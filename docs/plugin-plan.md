# DSH plugin plan

Status: the plugin is implemented and merged. One rework remains: the console transport. The
sections below give the current state, the reason for the rework, the target design, the risks, and
the alternatives. Implemented stages are not repeated here. The history holds them.

## Current state

The package `@memlens/dsh-plugin` does all of this today:

- The host entry and the `./preset` entry resolve the configuration per agent.
- The plugin gives each agent one memory context, the six memory tools, the nudge, and the
  background compaction worker.
- The Web page gets the tab `Memory` from the slot `conversation.view`. The entry id is `memlens`.
- `memlens ui` and the tab share one component layer in `packages/ui`. A component holds no style,
  no transport, and no address. Each shell supplies its own.
- The picture [demo/plugin-tab.png](demo/plugin-tab.png) shows the tab in an isolated profile.

The tab reads and writes through one HTTP route. The plugin registers the prefix
`/plugins/memlens` on the harness Web server. It calls `ctx.connection.requestRejection` before each
answer. It resolves the session profile and scope through the plugin service. The route serves the
console reads, the note actions, and the host runtime state.

## Why the route is the wrong transport

The route works. It is the wrong level, and it fails open.

1. The harness Web server owns no authentication. Its own documentation states that the carrier
   gives no authentication and no Origin policy. A plugin route must add both.
2. The guard is plugin code. The call is `connection?.requestRejection(request)`. A composition
   without the Connection service skips the check, and the route answers any caller. A store of
   personal memory then has no protection.
3. The route misses the owner check. The exact Fetch routes of Connection admit only a Peer with an
   owner principal. A prefix route admits any authenticated Peer.
4. DSH documents the normal plugin path for operations: a Remote method on a generated service. The
   plugin cannot run the generator. The loader still accepts a hand-written contribution, and it
   names that case: "Manual `ctx.typert.register()` remains available for contributions that do not
   use a `./typert` artifact".
5. This repository already did the same rework on another project. `~/prj/dsh/dsh-prompt-profiles`
   serves `promptProfiles` as a hand-written Typert Remote. The host registers a
   `TypertRemoteService`. The client mounts a mirrored contribution with `ctx.remote.$mount` and
   injects `remote.promptProfiles`. That code is the reference shape.
6. The route duplicates transport that the harness already has: the peer, the request codec, the
   cancellation, and the error envelope.

## Target design

The host side:

- One method table for the console operations: `view`, `search`, `open`, `catalog`, `status`, and
  `action`.
- One strict schema for each input and each result. The schema rejects an unknown field.
- Descriptors for both faces come from that one table, so they cannot drift.
- One class extends `TypertRemoteService`. It delegates each method to the existing console
  operation. The operations in `console/read.ts`, `console/action.ts`, and `console/status.ts`
  stay.
- `ctx.typert.register(contribution)` runs inside one Cordis effect, so plugin disposal removes the
  namespace.

The client side:

- The client mounts the mirrored contribution with `ctx.remote.$mount`.
- The console port calls `remote.memlens.<method>` instead of `fetch`.
- The slot inject still gives the session id. It travels in the input of each method.
- The base path `/plugins/memlens` disappears from the client.

The transport seam stays `StorePort` in `packages/ui/src/model/console.ts`. The tab builds one port
over the Remote. `memlens ui` keeps its own HTTP port. No component changes.

| Path | Change |
| --- | --- |
| `packages/dsh-plugin/src/console/remote.ts` | new: method table, schemas, descriptors, service, registration |
| `packages/dsh-plugin/src/console/http.ts` | remove: route, trust guard, body parse, status codes |
| `packages/dsh-plugin/src/index.ts` | register the Remote instead of the route |
| `packages/dsh-plugin/src/client/console.ts` | build the port over the Remote |
| `packages/dsh-plugin/src/client/context.ts` | add the structural type of the remote facade |
| `packages/dsh-plugin/package.json` | add the peer and dev entries for the typert packages and zod |
| `packages/dsh-plugin/tests/*` | replace the Web server stub with a remote facade stub |

## Execution order

1. Read the contribution types of the installed version. Write the method table and the schemas.
2. Implement the host service and the registration. Prove it with one unit call per method.
3. Mount the client contribution. Replace the port. Prove one read and one action from the client
   test.
4. Remove the route, its trust guard, and its tests. Check that `ctx.webServer` holds no route from
   the plugin.
5. Run the focused tests, `pnpm run format`, and `pnpm run verify`.
6. Pack the plugin. Load it in an isolated profile. Open the tab in a session. Read one screen and
   apply one note action.
7. Remove the isolated profile and the temporary home.

## Difficulties and risks

- The reference project targets `0.2.1-alpha.2`. The contribution shape of the installed version is
  `{ schemas, model, invocations }`, and each invocation is a typed descriptor. The descriptor
  builder must follow the installed types. Copying the old builder is not enough.
- The two faces need the same descriptor ids and the same wire names. A mismatch gives a missing
  namespace at run time, and no error at registration.
- The client facade must expose `$mount`. Verify this against the installed client packages before
  the implementation, not after.
- The console results are structural types, not schemas: the console model, the index hits, and the
  open answers. Writing strict schemas for them is the largest part of the work.
- The session id must stay in each input, because the transport no longer carries a query string.
  The host must still resolve the agent from it.
- The HTTP status codes disappear. Each failure becomes a `RemoteError` with a code. The client
  shows only the message, so keep the cause text.
- The navigation failure mode changes. A missing namespace fails at run time, not at build time.
- The live check still needs one session in a harness profile. The check stays outside the automatic
  tests.

## Alternatives

1. Keep the route. Rejected: fail-open guard, no owner check, transport duplication.
2. `ctx.connection.fetch.register`. The exact Fetch routes of Connection apply the authentication
   and admit only the owner. Five shipped packages use them. This is the smallest change, and it
   stays the fallback if the Remote cannot be mounted in the installed version.
3. A session command through `ctx.remote.commands.execute`. Each console read would enter the
   session transcript as a human command. Rejected.
4. A `wire.view` projection. The console reads the store, not the session events. Rejected.
5. Two transports behind `StorePort`. The interface already hides the transport, so the plugin can
   keep the route as a fallback during the change. Remove it before the handoff.

## Acceptance

- The tab shows the seven screens and the five note actions. No HTTP route from the plugin exists.
- The plugin registers no path on the Web server.
- The type check, the tests, and `pnpm run verify` pass.
- The packed artifact loads in an isolated profile. A read and an action reach the store.
- The plugin leaves no surface that answers without authentication.

## Delegation and integration

| Owner | Owned work | Boundary |
| --- | --- | --- |
| Contract agent | The method table, the schemas, and the descriptor builder | No service class and no client source. |
| Host agent | The service class, the registration, and the host tests | No client source and no component. |
| Client agent | The client mount, the Remote port, and the client tests | No host service and no component. |
| Lead | The removal of the route, the entry wiring, the manifest, the build, the isolated-profile check, and the final checks | Resolve shared edits before agents write. |

Each agent must load `grace-lite`, `ponytail`, and `dsh-doc`. Each agent must read the module
contracts of the files it touches. The lead owns `index.ts`, the manifest, and the build.

## Deferred work

The import from harness sessions stays outside this plan.
The existing open questions about the import, the store identity, the tokenizer, and the incremental
export do not block this rework.

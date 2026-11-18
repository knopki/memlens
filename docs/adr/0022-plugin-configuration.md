# 0022. Plugin configuration

Status: accepted.

## Context

The plugin has one host entry and one preset entry. DSH activates each preset revision once and shares it across selecting agents.
An agent scope inherits the scope of that preset revision. A separate service for each preset needs explicit Cordis isolation.

## Decision

The host entry supplies one `memlens` service and one store. The bundle patch inserts only the host row, with id `memlens`.
An agent preset mounts the module `@memlens/dsh-plugin/preset` with the row id `memlens/preset`.
The preset key `profile` is optional, and its default is `default`. The exported plugin names are
`dsh-memlens` and `memlens/preset`.

The preset entry registers its settings in the shared service under the DSH scope key of its caller.
An agent selects the nearest registration in its scope chain. Without a registration, the host uses the default profile.
The preset owns its registration. The host owns the store, and each agent owns its cached memory inputs.

The core owns the defaults. A missing base file changes no value.
The plugin rejects other file errors. The patch store path wins over the environment and the base file.

The transform branch of each schema checks the raw value with the core rule and drops a rejected layer.
The declared fields stay permissive, so no row value blocks a session. The service re-reads the merged
row with the same rule.

The plugin checks no model metadata. A model that holds no memory is a configuration error of the user.

## Alternatives

A service for each preset needs extra realms and cannot serve host consumers through ordinary agent lookup.
A disabled preset row in the host bundle cannot work at host scope and gives the user an unusable entry.
A copy of the defaults in each frontend gives two sources for one value.

## Consequences

Different presets share one store and keep separate memory settings. The host needs no new service package or persistent configuration table.
The plugin registers no memory context or tool in this stage.

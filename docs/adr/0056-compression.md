# 0056. Compression

Status: accepted

## Context

A slice above the limit costs tokens at each assembly. A cut keeps the newest text, and the address keeps the old text reachable.

## Decision

The compression works on `<directions>` first, then on `<here>`, and it cuts no policy text. A part above 1.5 times its budget loses the oldest `<here>` lines, and one line `#<a>-<b> omitted (N lines, compacting)` takes their place. `memory_open` gives the range.

## Alternatives

Cut the newest lines. Cut a whole block. Truncate the text with no marker.

## Consequences

The `<here>` part stays at 1.5 times the budget or below. A `<directions>` part above its limit keeps its lines. The agent sees one line about the gap. The old text costs one more call of the tool.

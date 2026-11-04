# Architecture

Status: draft. There is no code. The stack is not selected. See [Q-001](03-open-questions.md#q-001).

## Parts

| Part | Interface | Function |
|---|---|---|
| Headless library | Public function interface, TBD | TBD. See [Q-002](03-open-questions.md#q-002). |
| CLI frontend | Terminal command, TBD | Gives the library functions to a user in a terminal. |
| DSH plugin | DSH tool and command surface, TBD | Gives the library functions to DSH. |

## Access direction

Assumption: the CLI frontend and the DSH plugin use the headless library. The library does not use
the frontend. See [Q-006](03-open-questions.md#q-006).

## Data

TBD. No statement about storage, format, or volume yet.

## Limits

TBD. No statement about latency, volume, or cost yet.

## Postponed items

TBD. Each postponed item gets an identifier and a reason in
[01-goals-nongoals.md](01-goals-nongoals.md).

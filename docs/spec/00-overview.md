# Overview

## Product

memlens is the long-term memory of an agent. The name joins memory and lens, and the lens gives the
zoom into the tree.

The memory holds profiles and scopes. It works in DeepSeek Harness and in a terminal.

## Problem

An agent forgets between sessions. A new session starts without the facts of the old sessions. A long
chat is not the answer: each token costs, and the model still loses the old facts.

## What the memory is

The memory holds current note rows in one SQLite database. A summary row stands above the notes, and
the agent reads a map of the scopes. It is not a chat history and it is not an event log.

A write makes one note: a `body` of 384 characters for the tree and a `longform` document of
16 384 characters for the full text. The `body` becomes a leaf of the tree. The `longform` stays out
of the tree.

## Two levels

The leaves are the notes of a scope. Above them are summary rows, one row for each aligned range of
slots. A summary row is a cache entry, and a change deletes the rows over the changed slot.

The map of directions comes from the scopes of the profile. The store derives it at read time, and
the profile gives its line budget. There is no catalog scope and no catalog tree.

## Users

| Role  | Action                                                                         | Value                                     |
| ----- | ------------------------------------------------------------------------------ | ----------------------------------------- |
| Agent | Reads the map of directions at start, gets a note by its address, writes notes | The facts survive a session and a harness |
| Human | Reviews, hides, redacts, and amends in the console or the CLI                  | Control over what the agent remembers     |

## Success criteria

- The agent starts a new session with a map of directions.
- The map gives the fresh items in detail and the old items in a short form.
- The agent gets any fact word for word by its address.
- One note costs one model call for its whole life.
- A read costs no model call.

## What the memory is not

A replacement for compaction, an infinite chat, a vector search, an entity graph, or a live
synchronization between machines. See [01-goals-nongoals.md](01-goals-nongoals.md).

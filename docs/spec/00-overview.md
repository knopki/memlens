# Overview

## Product

memlens is the long-term memory of an agent. The product name is «Линза» (Lens). The name gives the
idea: look through one layer into the depth.

The memory holds profiles and scopes. It works in DeepSeek Harness and in a terminal.

## Problem

An agent forgets between sessions. A new session starts without the facts of the old sessions. A long
chat is not the answer: each token costs, and the model still loses the old facts.

## What the memory is

The memory is a log of curated notes with a tree of retellings above the notes. It is not a chat
history.

A write makes one note: a `body` of 384 bytes for the tree and a `longform` document of 16 KiB for
the full text. The `body` becomes a leaf of the tree. The `longform` stays out of the tree.

## Two levels

The leaves are the notes of a scope. Above them is a catalog: a log of cards `[scope] state` with
its own tree. The catalog belongs to a profile, so a scope of another profile does not enter a
shared node.

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

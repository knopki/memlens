# 0040. Frontier order

Status: accepted

## Context

The agent reads the map from the old context to the fresh one, and a fresh record can wait for the writer.

## Decision

The frontier lists the lines from the oldest to the newest. A line holds the address, the range of dates, and the text. The last lines are the records that no node covers.

## Alternatives

List the fresh lines first. List the nodes without the records.

## Consequences

A reader finds the recent lines at the end. The count of the last lines changes with the writer.

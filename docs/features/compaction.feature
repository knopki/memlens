# Sample of the behavior format. Not accepted yet. See the folder README.
# Proven by packages/core/tests/compaction.test.ts and
# packages/dsh-plugin/tests/worker.test.ts. Decision: ADR-0023.
Feature: Batch compaction
  The compaction worker merges the dirty ranges of the summary tree.
  One batch model call carries the ready merge inputs of one pass.

  Background:
    Given a store with dirty ranges
    And a configured model route

  Scenario: One batch call carries the ready inputs
    When the worker runs a pass
    Then the worker sends one batch of merge inputs to the model route
    And the batch holds the configured count of inputs

  Scenario: A good line publishes its range at once
    When the model answers one line for each range of the batch
    Then the worker writes the node row of each good line
    And the covering summary rows leave the store

  Scenario: A bad line keeps its range open
    When the model omits a line, or the line fails the shrink check
    Then the worker publishes the good lines of the same answer
    And the worker retries the open ranges in a batch of half the size
    And a range that still fails stays dirty for the next pass

  Scenario: A missing route fails the pass
    When the model route is not configured
    Then the worker fails the pass
    And the journal states the missing route

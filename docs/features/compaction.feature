# Requirements: REQ-204, REQ-290, REQ-459, REQ-518, REQ-571, REQ-572,
# REQ-573, REQ-574, REQ-575, REQ-576, REQ-577
# Proven by packages/core/tests/compaction.test.ts,
# packages/core/tests/console.test.ts,
# packages/dsh-plugin/tests/worker.test.ts
# Decisions: ADR-0023
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

  Scenario: The batch count defaults to ten
    Given no batch key in the base file
    When the worker runs a pass
    Then each call carries ten inputs

  Scenario: The batch count sets no upper limit
    Given the batch key with the value 500 in the base file
    When the load runs
    Then the load accepts the value
    And one call carries 500 inputs

  Scenario: The batch count accepts whole numbers above zero only
    Given the batch key with the value 0 in the base file
    When the load runs
    Then the load rejects the value
    And the plugin starts on the default base

  Scenario: The compaction section rejects the mode key
    Given the mode key in the compaction section
    When the load runs
    Then the load rejects the file as an unknown key

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

  Scenario: The pass calls the harness LLM service
    When the worker runs a pass in the harness
    Then the call names the configured provider and model
    And the worker sets no model and no effort by itself

  Scenario: The pass starts on four triggers
    When dirty candidates reach the batch count
    Or the store idle time expires
    Or a user runs memlens compact
    Or activation ends and work waits
    Then background work starts
    And the store holds no job queue

  Scenario: The console gives a compaction job
    When the operator starts a job in the console
    Then the console writes the answer of the job
    And the job builds its node

  Scenario: A job without a merge input states that fact
    Given a settled scope with no dirty range
    When the operator prepares a job
    Then the console states that no merge input exists
    And the console opens no answer form

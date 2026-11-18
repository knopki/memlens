# Proven by packages/dsh-plugin/tests/memory-context.test.ts,
# packages/dsh-plugin/tests/service.test.ts,
# packages/dsh-plugin/tests/store-open.test.ts,
# packages/core/tests/context.test.ts
# Decisions: ADR-0007, ADR-0025
Feature: Memory context
  The plugin gives the agent one snapshot of the slice as runtime context.
  The session keeps the text of that snapshot until a session start or a successful compaction.

  Background:
    Given one agent with the scope project:alpha
    And a store with one note in that scope

  Scenario: A second assembly gives the kept text
    Given the agent reads the memory context once
    When the plugin assembles the memory context again
    Then the text does not change
    And a later note of the scope stays out of the text

  Scenario: The plugin reads the last runtime context message
    Given a session history with a runtime context message that holds the memory section
    And a user message after that message
    When the plugin registers the memory context
    Then the text is the text of that section

  Scenario: A redact keeps the earlier snapshot
    Given a session history with the memory text
    When a human redacts a note of that text
    Then the history keeps the earlier text

  Scenario: The memory context stays with optional context off
    Given a harness that disables optional runtime context
    When the plugin registers the memory context
    Then the request holds the memory context

  Scenario: A restart gives the same text
    Given a session with the memory text of the store
    When a new process starts with the same session history
    Then the memory context gives the same text

  Scenario: Only a session start and a successful compaction give a new text
    Given a session with the memory text
    When a turn ends and a note write lands
    Then the text does not change
    And a failed compaction gives no new text
    When the session compaction succeeds
    Then the memory context gives a new text

  Scenario: Each session renders its own snapshot
    Given two sessions of one store
    When each session registers its memory context
    Then each session gives its own text

  Scenario: A live session restores its surface after a restart
    Given a live session with its memory surface
    When the plugin restarts and the session stays
    Then the session writes a note with memory_note
    And memory_find gives that note
    And the next request holds the memory context

  Scenario: A session continues while the store does not open
    Given a live session and a store that does not open
    When the session registers its memory surface
    Then the memory tools answer errors
    And a session without a saved section gives no memory context
    When the store opens and the host respawns the surface
    Then the session holds the memory context

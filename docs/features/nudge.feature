# Requirements: REQ-233, REQ-235, REQ-237, REQ-241, REQ-242
# Proven by packages/dsh-plugin/tests/nudge.test.ts,
# packages/dsh-plugin/tests/memory-context.test.ts
# Decisions: ADR-0007
Feature: Nudge
  The plugin counts the memory tool calls and the turns of one agent.
  At a limit it injects one short line, and both counts start again.

  Background:
    Given one agent with the nudge settings of the base file

  Scenario: The two counts run at the same time
    Given the limits of two tool calls and three turns
    When the agent calls one memory tool and ends one turn
    And the agent calls a second memory tool
    Then the counts read two tool calls and one turn

  Scenario: The count takes the place of the placeholder
    Given the text "tools {n} since" for the tool call count
    When the tool call count reaches its limit of two
    Then the line reads "tools 2 since"

  Scenario: A nudge starts both counts again
    Given a turn count that reached its limit
    When the plugin injects the nudge line
    Then the two counts start again from zero

  Scenario: A note write resets both counts
    Given a tool call and an ended turn after the last nudge
    When the agent writes a note
    Then the two counts read zero and zero

  Scenario: The line arrives as an own message
    Given the limit of two tool calls
    When the agent calls its second memory tool
    Then the plugin injects one user message
    And the source kind of the message is memlens-nudge
    And the memory context holds no nudge line

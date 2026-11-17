# Requirements: REQ-260, REQ-261, REQ-310, REQ-343
# Proven by packages/core/tests/address.test.ts,
# packages/core/tests/store-reads.test.ts,
# packages/dsh-plugin/tests/memory-tools.test.ts,
# packages/cli/tests/commands.test.ts
# Decisions: ADR-0006, ADR-0020
Feature: Addresses and the active scope
  An address names one record by its position, or by a scope and a position.
  An address with no scope takes the scope of the session.

  Background:
    Given a session with the active scope `user:notes`
    And a record at position 0 of the scope `user:notes`
    And a record at position 0 of the scope `project:acme/x`

  Scenario: An address with no scope gives a record of the active scope
    When the agent opens the address `0`
    Then the answer gives the record 0 of `user:notes`
    And the answer gives the address `user:notes#0`

  Scenario: An address with a scope gives a record of that scope
    When the agent opens the address `project:acme/x#0`
    Then the answer gives the record 0 of `project:acme/x`
    And the answer gives the address `project:acme/x#0`

  Scenario: A write with no scope goes to the active scope
    When the agent writes a note with no scope field
    Then the store puts the record in `user:notes`
    And the answer names the scope `user:notes`

  Scenario: A review target with a number needs a scope
    When the agent marks the target `0` as reviewed
    Then the call fails and asks for a scope
    And the target `user:notes#0` marks the record

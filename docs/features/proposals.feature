# Proven by packages/dsh-plugin/tests/memory-tools.test.ts,
# packages/dsh-plugin/tests/memory-context.test.ts,
# packages/dsh-plugin/tests/console.test.ts and
# packages/core/tests/store-proposals-repair.test.ts.
# Decisions: ADR-0009, ADR-0012, ADR-0021.
Feature: Memory proposals
  A subagent proposes, and the store holds each proposal for the parent.
  A human in the console accepts or dismisses a proposal.

  Scenario: No agent tool decides a proposal
    Given one open proposal
    When the agent reads its tool list
    Then the list holds no `amend`, no `redact`, no `accept`, and no `dismiss`
    And the store closes an expired proposal with no human

  Scenario: A proposal names a new note or an existing record
    Given a subagent of the mode `propose`
    And an agent with the profile `narrow`
    When the subagent writes a note
    And the agent with the profile `narrow` forgets a record of `global:prefs`
    Then the store holds a proposal of the op `note`
    And the store holds a proposal of the op `hide` with the record id

  Scenario: A propose subagent marks each write as proposed
    Given a subagent of the mode `propose`
    When the subagent writes a note
    Then the answer holds `proposed: true`

  Scenario: A read subagent gets no writing tool
    Given a subagent of the mode `read`
    Then its tool list holds `memory_find`, `memory_map`, and `memory_open`
    And its tool list holds no `memory_note`

  Scenario: An off subagent gets no memory
    Given a subagent of the mode `off`
    Then its tool list is empty
    And the runtime context holds no slice

  Scenario: A forget outside the profile stays a proposal
    Given a record of the scope `global:prefs`
    And a profile with the scope `project:memlens`
    When the agent calls `memory_forget` with the address of the record
    Then the store holds one open proposal of the op `hide`
    And the record state stays `live`

  Scenario: A review outside the profile fails
    Given a profile with the scope `project:memlens`
    When the agent calls `memory_review` with a record of a foreign scope
    Then the call fails with the error `NotAllowed`

  Scenario: A supersede target outside the profile fails
    Given a profile with the scope `project:memlens`
    When the agent writes a note with a supersede target of a foreign scope
    Then the write fails with the error `NotAllowed`
    And the store holds no proposal

  Scenario: A subagent write gives the id of the proposal
    Given a subagent of the mode `propose`
    When the subagent writes a note
    Then the answer holds the id of the proposal
    And the store holds no record

  Scenario: The child answer names the parent
    Given a subagent of the mode `propose`
    When the subagent writes a note
    Then the answer holds `Proposed to your parent:` and the body

  Scenario: The proposals of one child collect under one session
    Given a subagent with the parent session `parent-session`
    When the subagent writes three notes
    Then the store holds three open proposals of that child session

  Scenario: The parent report names each child proposal
    Given a child session with three proposals
    When the child session ends
    Then the parent receives one message with three lines
    And each line holds the tag `[memory proposals from <child>]`, the proposal id, and the body
    And each line holds no record address

  Scenario: The parent applies a child suggestion with an ordinary write
    Given an open proposal of the child
    When the parent calls `memory_note` with the suggested body
    Then the store holds the new note as live
    And the tool list holds no acceptance tool

  Scenario: The console approval applies the op and closes the proposal
    Given one open proposal of the op `hide`
    When the human approves the proposal in the console
    Then the record state is `hidden`
    And a second approval gives `no longer pending`

  Scenario: A forget answers the empty object
    When the agent calls `memory_forget` on a record of its profile
    Then the answer is `{}`

  Scenario: A propose subagent gets four tools and the scope list
    Given a subagent of the mode `propose`
    Then its tool list holds `memory_find`, `memory_open`, `memory_note`, and `memory_map`
    And the slice holds the key of each visible scope

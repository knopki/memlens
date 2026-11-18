# Proven by packages/dsh-plugin/tests/memory-tools.test.ts and
# packages/dsh-plugin/tests/memory-context.test.ts and
# packages/dsh-plugin/tests/loader.test.ts.
# Decisions: ADR-0007, ADR-0009, ADR-0021.
Feature: Agent memory tools
  The main agent reads and writes the memory of its profile.
  The memory slice arrives as runtime context of the session.

  Background:
    Given a store with notes
    And a main agent with a profile and an active scope

  Scenario: The slice arrives as runtime context
    When the harness assembles the request of the agent
    Then the runtime context holds one section named `memlens`
    And the section text holds the block `<memory>`

  Scenario: A forget hides a note
    Given a note of the profile
    When the agent calls `memory_forget` with the address of the note
    Then the record state is `hidden`

  Scenario: The main agent writes a live note
    When the main agent calls `memory_note` with a body
    Then the store holds the note with the state `live`
    And the answer names the saved address

  Scenario: The review tool answers the due list
    Given one note is due and one note is later
    And a main agent with the tool `memory_review`
    When the agent calls `memory_review` with no field
    Then the answer holds the due note only

  Scenario: The review description limits the tool to a user request
    Given a main agent with the tool `memory_review`
    Then the description of the tool names a user request

  Scenario: The open description names the address form
    Given a main agent with the tool `memory_open`
    Then the description names the form `scope#pos`

  Scenario: A map call with no scope gives the direction lines
    Given a profile with two visible scopes
    When the agent calls `memory_map` with no field
    Then each line gives one scope with its age and its summary
    And the scopes above the directions budget join one line of keys

  Scenario: A map call with a scope gives the frontier lines
    When the agent calls `memory_map` with the scope `user:notes`
    Then the lines equal the `here` block of that scope
    And the lines stop at the `here` budget

  Scenario: A map call outside the profile fails
    Given a profile with the scope `project:memlens`
    When the agent calls `memory_map` with the scope `global:prefs`
    Then the call fails with the error `NotAllowed`

  Scenario: A map call keeps the active scope
    When the agent calls `memory_map` with the scope `project:memlens`
    And the agent calls `memory_note` with no scope
    Then the note goes to the active scope `user:notes`

  Scenario: A subagent has no forget tool and no review tool
    Given the profile sets the mode `propose`
    And a subagent of that profile starts
    Then its tool list holds no `memory_forget`
    And its tool list holds no `memory_review`

  Scenario: The active scope joins the profile
    Given a profile that lists only `project:memlens`
    And the active scope `user:notes`
    When the agent calls `memory_note` with no scope
    Then the store holds a live note of `user:notes`
    And `memory_map` with no field lists `user:notes`

  Scenario: A registration error skips the memory surface
    Given a memory registration error at the start of one agent
    When the agent starts
    Then the agent holds no memory tool
    And the agent startup continues

# Proven by packages/core/tests/store-schema.test.ts,
# packages/core/tests/store-proposals-repair.test.ts,
# packages/core/tests/store-notes.test.ts,
# packages/core/tests/store-locks.test.ts,
# packages/core/tests/store-reads.test.ts,
# packages/core/tests/store-seams.test.ts,
# packages/core/tests/store-transfer.test.ts,
# packages/core/tests/view-slice.test.ts,
# packages/core/tests/compaction.test.ts,
# packages/core/tests/context.test.ts,
# packages/core/tests/active-scope.test.ts,
# packages/core/tests/isolation.test.ts,
# packages/dsh-plugin/tests/memory-context.test.ts,
# packages/cli/tests/commands.test.ts
# Decisions: ADR-0004, ADR-0006, ADR-0008, ADR-0020
Feature: The row store
  The store keeps the memory as note rows in one SQLite database.
  A slot gives the rank of the note key in its scope.

  Background:
    Given one open store
    And one profile over the scopes of the store

  Scenario: A note takes the rank of its key as its slot
    Given notes of January, March, and April in one scope
    When a note of February arrives
    Then the February note takes slot 1
    And the March note takes slot 2
    And the April note takes slot 3
    And two notes of one `ts` order by `id`

  Scenario: A hidden note keeps its slot and an import cannot restore it
    Given a note at slot 0 of one scope
    When a hide hides the note
    Then the note keeps slot 0
    And the note keeps its body
    And the index holds no row for the note
    When an old live export of the note arrives
    Then the note stays hidden
    And a cleared note travels with no content

  Scenario: The render gives the tree of retellings above the notes
    Given three live notes of one scope
    And a valid node over the first two notes
    When the view renders that scope
    Then the first line gives the summary of the node
    And the next line gives the third note

  Scenario: A changed note holds back its old summary
    Given a valid node over slots 0 and 1
    When a note of that range changes
    Then the render gives the text of the children
    And the render gives no stale summary
    And a rebuilt node gives its new summary

  Scenario: A render reads rows only
    Given a scope with a dirty range
    And a store with no model service
    When the view renders the scope
    Then the render gives the text of the notes
    And the render makes no model call
    And the render waits for no compaction

  Scenario: The directions section holds the newest scopes within its budget
    Given six scopes of one profile
    And a directions budget of two
    When the directions section renders
    Then the section holds two direction lines
    And the lines give the two newest scopes
    And the first line gives the older scope of the two

  Scenario: The older scopes collect in one comma list
    Given more scopes than the directions budget
    When the directions section renders
    Then the section starts with one line of scope keys
    And the line joins the keys with a comma
    And the line holds no description

  Scenario: Two profiles that list one scope share it
    Given two profiles
    When each profile lists the scope `project:acme/x`
    Then each profile gives one entry for that scope
    And the scope key is the same in both lists

  Scenario: Two sessions write at the same time
    Given two sessions with one open store
    When each session writes one note at the same time
    Then the store holds both notes when each lock wait fits its budget
    And the store reports one error when a lock wait outlasts its budget

  Scenario: A redact clears a note and its derived content
    Given a note with a node row above it and a search index entry
    When the store redacts the note
    Then the note holds no content
    And the node row, the search index entry, and the proposals of the note are absent

  Scenario: An operator moves the notes of one scope into another
    Given three notes with content in the source scope
    And one note in the destination scope
    When the operator runs the move command between these scopes
    Then the destination holds all four notes in their key order
    And each note keeps its id and state
    And the source holds no note with content

  Scenario: An operator previews a scope move
    Given notes with content in the source scope
    When the operator runs the move command with --dry-run
    Then the command reports the count and both scopes
    And the store keeps its earlier state

  Scenario: A scope move leaves cleared rows in the source
    Given one note with content and one cleared row in the source scope
    When the operator runs the move command to another scope
    Then the destination holds the note with content
    And the source keeps the cleared row
    And the command reports the address of the cleared row

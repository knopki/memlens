# Requirements: REQ-009, REQ-160, REQ-236, REQ-270, REQ-375, REQ-521, REQ-522, REQ-523, REQ-527, REQ-528, REQ-529, REQ-530, REQ-534, REQ-537
# Proven by packages/core/tests/store-schema.test.ts,
# packages/core/tests/store-proposals-repair.test.ts,
# packages/core/tests/store-notes.test.ts,
# packages/core/tests/store-reads.test.ts,
# packages/core/tests/store-seams.test.ts,
# packages/core/tests/store-transfer.test.ts,
# packages/core/tests/view-slice.test.ts,
# packages/core/tests/compaction.test.ts,
# packages/core/tests/context.test.ts,
# packages/core/tests/active-scope.test.ts,
# packages/core/tests/isolation.test.ts,
# packages/dsh-plugin/tests/memory-context.test.ts
# Decisions: ADR-0004, ADR-0006, ADR-0008, ADR-0020
Feature: The row store
  The store keeps the memory as note rows in one SQLite database.
  A slot gives the rank of the note key in its scope.

  Background:
    Given one open store
    And one profile over the scopes of the store

  Scenario: The store holds one database
    When the store opens
    Then the database holds the tables `meta`, `notes`, `nodes`, `proposals`, and `journal`
    And the library holds no storage directory
    And an old event-store database fails to open

  Scenario: A note takes the rank of its key as its slot
    Given notes of January, March, and April in one scope
    When a note of February arrives
    Then the February note takes slot 1
    And the March note takes slot 2
    And the April note takes slot 3
    And two notes of one `ts` order by `id`

  Scenario: A tombstone keeps its slot and no path restores it
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

  # No proving test found
  @wip
  Scenario: Each scope of a profile accepts a write
    Given a profile with two visible scopes
    When the agent writes a note in each scope
    Then the store gives one record in each scope

  # No proving test found
  @wip
  Scenario: The store sets no limit on the number of notes
    Given a store with 1000 notes
    When the agent writes one more note
    Then the store holds 1001 note rows

  # No proving test found
  @wip
  Scenario: Two sessions write to one scope
    Given two sessions of one profile
    When each session writes a note to `user:notes`
    Then the store holds both records
    And the store reports no error

  Scenario: A redact is one transaction and clears the raw bytes
    When the store redacts a note with a unique marker
    Then the redact runs in one transaction
    And the marker text is absent from the database file
    And the marker text is absent from the write-ahead log

  Scenario: The journal holds no content
    When a write makes a journal row
    Then the journal row holds no content and no hash
    And no state path reads the journal
    And a check prunes the journal to its row limit

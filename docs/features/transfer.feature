# Requirements: REQ-524, REQ-525, REQ-526, REQ-531, REQ-532, REQ-535
# Proven by packages/core/tests/store-transfer.test.ts,
# packages/core/tests/store-schema.test.ts,
# packages/core/tests/store-reads.test.ts,
# packages/core/tests/ulid.test.ts,
# packages/cli/tests/commands.test.ts
# Decisions: ADR-0020
Feature: Transfer and store merge
  One JSONL file carries the notes between two stores.
  An import joins the copy with the local row, and no update is lost.

  Background:
    Given two stores

  Scenario: One export reproduces the note rows of an empty store
    Given notes in the live, hidden, and deleted states in the first store
    When the second store imports the export of the first store
    Then the second store holds the same note rows
    And the file starts with a header line and ends with a trailer line
    And the file holds no slot, no proposal, and no summary

  Scenario: A repeated import changes no row
    Given the second store imported one file
    When the second store imports the same file again
    Then the second store holds the same rows
    And the import reports no new row and no merged row

  Scenario: A merge joins five channels
    Given two stores with diverged copies of one note
    When each store imports the export of the other store
    Then the content and the review follow the greater version
    And the state follows the greater rank
    And the cleared flag stays true
    And the first supersede link stays

  Scenario: An old export cannot restore a note
    Given a hidden note in the first store
    And an old export of that note in the live state
    When the first store imports the old export
    Then the note stays hidden
    And the note keeps its body
    Given a cleared export of that note
    And a younger local amendment of the note
    When the first store imports the cleared export
    Then the note takes the deleted state
    And the note holds no content

  Scenario: A local write outranks an imported version
    Given an export with a far future version
    When the first store imports the export
    Then the clock of the first store takes the imported version
    When the first store makes one local write
    Then the local version is greater than the imported version

  Scenario: The note id is the only identity across stores
    Given two stores with a copy of one note id
    When each store imports the export of the other store
    Then each store holds one row for that id
    And the row fields are equal in both stores
    And the id is a ULID

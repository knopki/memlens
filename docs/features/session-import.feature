# Requirements: REQ-413
# Pending. The selection rule of the note text is open. See Q-514
# in docs/spec/03-open-questions.md.
# No proving test: the import is pending.
Feature: Session import
  The CLI writes new notes of each host session into the store.

  @wip
  Scenario: The import writes new notes of a session
    Given one host session with a decision
    When the import runs on that session
    Then the store holds a new note of that session
    And the compaction builds the text of the note

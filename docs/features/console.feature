# REQ-566
# Proven by packages/dsh-plugin/tests/client.test.tsx,
# packages/dsh-plugin/tests/console.test.ts,
# packages/ui/tests/components/screens-b.test.tsx,
# packages/ui/tests/model/controller.test.ts
# Decisions: ADR-0009
Feature: Console surfaces
  The plugin gives the harness one page in the side panel and one tab of a session.
  A human reads the memory, changes a note, and opens each screen of the console.

  Background:
    Given the harness loads the memlens plugin

  Scenario: The panel row opens the console page
    When the plugin registers its surfaces
    Then the side panel holds a row with the id memlens
    And the main slot holds the page under that id

  # No proving test found
  @wip
  Scenario: The side panel holds one entry of the plugin
    When the plugin registers its surfaces
    Then the side panel holds one row of the plugin

  Scenario: The label comes from the locale service
    When the harness starts the page in Russian
    Then the side panel row reads Память
    And the English page reads Memory

  Scenario: Each screen name opens its screen
    When a human opens the console page
    Then the page shows the seven screen names
    And each name draws its screen

  Scenario: The session tab shows the slice of its session
    Given an open session with the memory tab
    When the tab loads
    Then the tab reads the view of that session
    And the host resolves the profile and the scope from the session
    And the tab holds no screen control

  Scenario: Each action on a note works as the CLI action does
    Given a note with a review date in a visible scope
    When a human opens the actions on that note
    Then the console offers Reviewed, Amend, Supersede, Forget, and Delete
    And each action changes the record as the CLI does
    And a delete needs a confirmation

  # No proving test found
  @wip
  Scenario: The scope menu shows one flat list
    Given a view with visible scopes
    When a human opens the scope menu
    Then the menu holds one entry for each visible scope
    And the menu holds no tree, no group, and no filter field

  # No proving test found
  @wip
  Scenario: The scope menu holds each visible scope
    Given a profile with fifty scopes
    When a human opens the scope menu
    Then the menu holds fifty entries

  # No proving test found. REQ-554 stays a draft.
  @wip
  Scenario: Each button keeps a contrast ratio of 4.5 to 1
    Given the console in the light theme and in the dark theme
    When a human measures each button
    Then the ratio between its text and its background is 4.5 to 1 or more

# Proven by packages/core/tests/config.test.ts,
# packages/core/tests/active-scope.test.ts,
# packages/dsh-plugin/tests/config.test.ts,
# packages/dsh-plugin/tests/defaults.test.ts
# Decisions: ADR-0022, ADR-0006
Feature: Configuration and the active scope
  The product takes its settings from three layers: the base file,
  the plugin patch, and the preset. A missing layer gives defaults,
  so a fresh install works with no configuration.
  The active scope key comes from the scope rules and the directory.

  Background:
    Given a harness profile with a memory plugin

  Scenario: A fresh install works with no configuration
    Given no config.toml in the config home
    When a new session starts
    Then the session starts with the default values
    And the profile of the session is default
    When the agent calls memory_note and memory_open
    Then memory_open gives the text of the new note

  Scenario: A preset row with no profile key uses the default profile
    Given a preset row with no profile key
    When a new session starts
    Then the profile of the session is default

  Scenario: A change of the base file applies with no restart
    Given one value in the base file
    When the value changes
    And a new session starts
    Then the new value applies

  Scenario: A matching scope rule gives the active scope key
    Given one rule of scope_default that matches the session
    When the session starts
    Then the active scope key is the key of that rule
    And the source list stays complete

  Scenario: The fallback chain of the active scope key
    Given no matching rule of scope_default
    When the session starts in a Git repository with a remote
    Then the active scope key comes from that remote
    And a directory with no repository and no workspace gives the key of `default`
    And a directory named `.config` gives the active scope key `project:.config`

# Requirements: REQ-031, REQ-544, REQ-545, REQ-546, REQ-547, REQ-548, REQ-555,
# REQ-556, REQ-557, REQ-558, REQ-559, REQ-560, REQ-564, REQ-567, REQ-568,
# REQ-561, REQ-562
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

  Scenario: A fresh install starts with no base file
    Given no config.toml in the config home
    When a new session starts
    Then the session starts with the default values

  Scenario: A session with no base file uses the default profile
    Given no config.toml in the config home
    When a new session starts
    Then the profile of the session is default

  Scenario: A session with no base file writes and reads a note
    Given no config.toml in the config home
    When the agent calls memory_note
    And the agent calls memory_open on the new note
    Then memory_open gives the text of the note

  Scenario: A preset row with no profile key uses the default profile
    Given a preset row with no profile key
    When a new session starts
    Then the profile of the session is default

  Scenario: A change of the base file applies with no restart
    Given one value in the base file
    When the value changes
    And a new session starts
    Then the new value applies

  Scenario: An absent section gives its defaults
    Given a base file without one section
    When the session starts
    Then the session uses the default values of that section

  Scenario: An invalid value degrades to the default layer
    Given an invalid value in the base file
    When the session starts
    Then the session starts with the default values

  Scenario: A matching scope rule gives the active scope key
    Given one rule of scope_default that matches the session
    When the session starts
    Then the active scope key is the key of that rule
    And the source list stays complete

  Scenario: The fallback chain of the active scope key
    Given no matching rule of scope_default
    When the session starts
    Then the active scope key comes from the first hit of this list:
    the Git remote, the repository name, the workspace name,
    the directory name, project:misc

  Scenario: A Git remote gives a project scope key
    Given a repository with the remote git@github.com:knopki/memlens.git
    When the session starts
    Then the active scope key is project:knopki/memlens

  Scenario: A repository with no remote gives a plain project key
    Given a repository named memlens with no remote
    When the session starts
    Then the active scope key is project:memlens

  Scenario: A named workspace with no Git repository
    Given a directory with no Git repository in a workspace named dsh
    When the session starts
    Then the active scope key is project:dsh

  Scenario: A plain directory with no repository and no workspace
    Given the directory /home/knopki/prj/memlens
    When the session starts
    Then the active scope key is project:memlens

  Scenario: No source gives a key
    Given the file system root
    When the session starts
    Then the active scope key is project:misc

  Scenario: The nudge takes its settings from its section
    Given a value in the nudge section
    When the value changes
    Then the nudge changes

  @wip
  # No example of the base file in the repository yet. REQ-561.
  Scenario: The repository holds an example of the base file
    Then the example states the path, each key, and its default value

  @wip
  # The plugin README holds no field list yet. REQ-562.
  Scenario: The plugin README states each patch and preset field
    Then the README holds each field with one example

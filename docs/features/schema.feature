# Proven by packages/core/tests/store-schema.test.ts
# Decisions: ADR-0020
Feature: The store schema
  The store keeps the version of its schema in one `meta` row.
  An open of a store behind the build migrates the tables in one transaction.

  Background:
    Given one store file

  Scenario: A store behind the build migrates at open
    Given a store file of a schema version behind the build, with note rows
    When the store opens the file
    Then the store holds the current schema version
    And the store keeps each note row and each slot
    And the migration runs in one transaction

  Scenario: A failed migration keeps the earlier schema and data
    Given a store file of a schema version behind the build
    And one step of the migration fails
    When the store opens the file
    Then the open fails
    And the store holds the earlier schema version
    And the store keeps each note row

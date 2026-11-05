# Superseded requirements

A later requirement replaces each item in this file. The item stays for the record, and it is not
live. The live rule is in [02-requirements.md](02-requirements.md).

| ID | Requirement | Type | Source | Replaced by |
| --- | --- | --- | --- | --- |
| REQ-021 | The slice updates at a new session, at a compaction after success, and at an idle time longer than the TTL. | FR | S-013, S-067 | REQ-300 |
| REQ-035 | A line about the subagent write goes to the report of the parent. | FR | S-013 | REQ-157 |
| REQ-036 | A subagent cannot hide a note and cannot review a note. | FR | S-013, S-067 | REQ-356 |
| REQ-055 | A session is a branch of a profile, and an import joins the records of the branch to the trunk. | FR | S-014, S-076 | REQ-375, REQ-057 |
| REQ-112 | A record with the state `proposed`, `hidden`, or `deleted` does not enter the card. | FR | S-023 | REQ-191 |
| REQ-248 | A merge gives the model the two children only, and no other context. | FR | S-061 | REQ-433 |
| REQ-364 | A `pos` target of `memory_forget` needs a `scope`. | FR | S-071 | REQ-338 |
| REQ-365 | A write of the kind `decision`, `preference`, or `note` without `reviewIn` gives a review date of 365 days. | FR | S-071 | REQ-457 |
| REQ-366 | A write of the kind `fact` without `reviewIn` gives a review date of 180 days. | FR | S-071 | REQ-457 |
| REQ-367 | A write of the kind `task` without `reviewIn` gives a review date of 7 days. | FR | S-071 | REQ-457 |
| REQ-369 | The write mechanism moves the text above 512 bytes into the `longform`. | FR | S-072 | REQ-011 |

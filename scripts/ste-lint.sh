#!/usr/bin/env sh
# Check the English documents against the ASD-STE100 limits.
# The linter is vendored. See scripts/vendor/README.md.
set -eu

exec python3 scripts/vendor/ste-lint.py \
  README.md \
  AGENTS.md \
  docs/spec/00-overview.md \
  docs/spec/01-goals-nongoals.md \
  docs/spec/02-requirements.md \
  docs/spec/03-open-questions.md \
  docs/spec/04-decisions.md \
  docs/spec/05-glossary.md \
  docs/spec/06-architecture.md \
  docs/spec/README.md \
  docs/adr/README.md \
  "$@"

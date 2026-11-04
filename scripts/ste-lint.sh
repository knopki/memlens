#!/usr/bin/env sh
# Check the English documents against the ASD-STE100 limits.
# The linter is vendored. See scripts/vendor/README.md.
set -eu

# A glob picks up each new document. The statement journal stays out: it keeps the words as given.
exec python3 scripts/vendor/ste-lint.py \
  README.md \
  AGENTS.md \
  docs/spec/*.md \
  docs/adr/*.md \
  "$@"

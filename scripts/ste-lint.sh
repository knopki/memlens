#!/usr/bin/env sh
# Check the English documents against the ASD-STE100 limits.
# The linter is vendored. See scripts/vendor/README.md.
set -eu

# Preserve historical vocabulary in the archive. Check its other language rules.
python3 scripts/vendor/ste-lint.py \
  --disable synonym-rotation \
  docs/spec/02-superseded.md \
  "$@"

# Include new documents. The journal retains the customer words and stays outside this check.
for document in README.md AGENTS.md docs/spec/*.md docs/adr/*.md; do
  if [ "$document" != docs/spec/02-superseded.md ]; then
    set -- "$@" "$document"
  fi
done
exec python3 scripts/vendor/ste-lint.py "$@"

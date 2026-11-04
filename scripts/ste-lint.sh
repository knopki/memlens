#!/usr/bin/env sh
# Check the English documents against the ASD-STE100 limits.
# The linter comes from the asd-ste100 skill. Set STE_LINT to use another copy.
set -eu

: "${HOME:?HOME is not set}"

LINTER=${STE_LINT:-}

if [ -z "$LINTER" ]; then
  for path in \
    "$HOME/.agents/skills/asd-ste100/scripts/ste-lint.py" \
    "$HOME"/.dsh/profiles/*/node_modules/asd-ste100/scripts/ste-lint.py \
    "$HOME"/.claude/skills/asd-ste100/scripts/ste-lint.py
  do
    if [ -f "$path" ]; then
      LINTER=$path
      break
    fi
  done
fi

if [ -z "$LINTER" ]; then
  echo "ste-lint: the linter is not found. Set STE_LINT to its path." >&2
  exit 127
fi

python3 "$LINTER" \
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

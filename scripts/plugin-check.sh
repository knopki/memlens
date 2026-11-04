#!/usr/bin/env sh
# Run the DeepSeek Harness plugin checks on packages/dsh-plugin.
# The CLI comes from the dsh-plugin-guide skill. Set DSH_PLUGIN_DEV to use another copy.
set -eu

: "${HOME:?HOME is not set}"

CLI=${DSH_PLUGIN_DEV:-}

if [ -z "$CLI" ]; then
  CLI=$(command -v dsh-plugin-dev || true)
fi

if [ -z "$CLI" ]; then
  for path in "$HOME"/.dsh/profiles/*/node_modules/dsh-plugin-guide/bin/dsh-plugin-dev.js; do
    if [ -f "$path" ]; then
      CLI=$path
      break
    fi
  done
fi

if [ -z "$CLI" ]; then
  echo "plugin-check: the CLI is not found. Set DSH_PLUGIN_DEV to its path." >&2
  exit 127
fi

node "$CLI" check --cwd packages/dsh-plugin "$@"

#!/usr/bin/env sh
# Check the DeepSeek Harness plugin manifest.
# The checker is vendored. See scripts/vendor/README.md.
set -eu

exec node scripts/vendor/dsh-plugin-guide/dist/dsh-plugin-dev.js check --cwd packages/dsh-plugin "$@"

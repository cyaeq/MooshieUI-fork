#!/usr/bin/env bash
# Activates the GlassWorm pre-commit hook for this repository.
# Run once after cloning:  bash scripts/setup-hooks.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "Configuring git hooks path..."
git -C "$REPO_ROOT" config core.hooksPath .githooks

echo "Setting execute bit on pre-commit hook..."
chmod +x "$REPO_ROOT/.githooks/pre-commit"

echo "Done. GlassWorm pre-commit hook is active."
echo "It will run automatically on every 'git commit'."

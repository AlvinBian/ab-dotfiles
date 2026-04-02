#!/usr/bin/env bash
set -euo pipefail

changeset version
git add -A
git commit -m 'chore: version packages'

VERSION=$(node -p "require('./package.json').version")
git tag "v${VERSION}"
git push --follow-tags

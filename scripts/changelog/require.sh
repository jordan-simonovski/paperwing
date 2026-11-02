#!/bin/sh
# Exits 1 when <base>..<head> changes the app but adds no changeset. The pre-push hook and CI both
# run this, so a pull request from a checkout without hooks still can't skip "What's new".
set -e
base=$1
head=$2
files=$(git diff --name-only "$base" "$head")
# A release commit rewrites CHANGELOG.md and consumes the changesets: nothing to ask for.
echo "$files" | grep -qx 'CHANGELOG.md' && exit 0
app=$(echo "$files" | grep -E '^(src/|api/|sw/|public/|index\.html$)' | grep -vE '(\.test\.tsx?|\.stories\.tsx)$|^src/test/|^api/_test/' || true)
added=$(echo "$files" | grep -E '^\.changeset/.+\.md$' | grep -v README.md || true)
if [ -n "$app" ] && [ -z "$added" ]; then
  echo "This changes the app but adds no changeset. Add one for readers (npx changeset, see .changeset/README.md), or npx changeset add --empty." >&2
  exit 1
fi

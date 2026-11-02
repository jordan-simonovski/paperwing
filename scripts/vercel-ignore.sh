#!/bin/sh
# Vercel's "Ignored Build Step" (vercel.json, ignoreCommand): exit 0 skips the build, exit 1 builds.
#
# Release = deploy. Production builds only for a release: the commit that merges the Release pull
# request, which is the only thing that writes CHANGELOG.md (npm run release). Ordinary merges to
# main collect there until the next release, so production never runs code ahead of its version
# and "What's new" always describes what's live. Put [deploy] in a commit message to force a
# production build without a release. Previews build as usual, except the Release PR's own branch.

case "$VERCEL_GIT_COMMIT_REF" in
  changeset-release/*)
    echo "The Release pull request's branch: no preview needed."
    exit 0
    ;;
esac

if [ "$VERCEL_ENV" != "production" ]; then
  exit 1
fi

case "$VERCEL_GIT_COMMIT_MESSAGE" in
  *"[deploy]"*)
    echo "[deploy] in the commit message: building production."
    exit 1
    ;;
esac

# Unchanged CHANGELOG.md: not a release. (If the previous commit can't be read, build to be safe.)
if git diff --quiet HEAD^ HEAD -- CHANGELOG.md 2>/dev/null; then
  echo "Not a release: production stays on the last release until the Release pull request is merged."
  exit 0
fi
echo "A release: building production."
exit 1

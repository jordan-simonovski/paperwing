// changesets' changelog generator (.changeset/config.json): one line per change, no commit hash,
// with its kind kept ("new: **…**") so format.mjs can group the release for readers.
module.exports = {
  getReleaseLine: async (changeset) => {
    const text = changeset.summary.trim().split('\n').filter(Boolean).join(' ')
    return text ? `\n- ${text}` : ''
  },
  getDependencyReleaseLine: async () => '',
}

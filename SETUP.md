# Installing the skin

1. If the workflow can't push, set Repo → Settings → Actions → General → Workflow permissions → **Read and write**.
2. Actions tab → "Refresh profile skin" → **Run workflow**. This pulls live data (incl. your real avatar) and commits fresh cards. After that it runs daily.

## Customising (`skin.config.json`)
- `theme`: `lime` (default), `mint` or `coral`
- `badge`: text of the pill top-right (set to `""` to hide)
- `tagline`, `location`, `website`
- `featured`: repo names shown as cards — if you change these, update the matching `<a>/<img>` lines in README.md
- `languageMode`: `repos` (count each repo's main language) or `bytes` (GitHub's code-size totals)
- `recentRepos`: with `languageMode: repos`, only count this many most-recently-updated repos (remove to count all)
- `descriptionOverrides`: `{ "repo-name": "custom text" }` for repos without a description

Local preview without a token: `node scripts/generate.mjs --data data/snapshot.json`

## Profile picture
The daily run embeds your GitHub avatar automatically. To use a different photo,
drop `avatar.jpg` (or .png) in the repo root — it takes priority.

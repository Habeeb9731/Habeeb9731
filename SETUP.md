# Installing the skin

1. If the workflow can't push, set Repo → Settings → Actions → General → Workflow permissions → **Read and write**.
2. Actions tab → "Refresh profile skin" → **Run workflow**. This pulls live data (incl. your real avatar) and commits fresh cards. After that it runs daily.

## Customising (`skin.config.json`)
- `theme`: `lime` (default), `mint` or `coral`
- `badge`: text of the pill top-right (set to `""` to hide)
- `tagline` (wraps to two lines if long), `location`, `website`
- `focus`: up to four pills under the tagline
- `highlights`: up to four stats on the profile card, each `{ "label", "value" }` or `{ "label", "source" }` with source `blogPosts`, `publicRepos` or `contributions` (counted live)
- `blogRepo` / `blogPath`: where blog posts live, one folder per post, for the `blogPosts` count
- `stack`: rows of `[group, [tools]]` for the Stack card; the first tool is highlighted
- `featured`: project cards, each `{ "repo", "title", "url", "tag", "description", "language" }` (`language` overrides the main language GitHub reports); cards link to `url` (or the repo)
- `intro` and `facts`: the About card; `links`: the contact cards under it, each `{ "icon", "label", "value", "url" }` (icons: mail, linkedin, globe, github, pin)

README.md is written by the generator from this file, so edit the config, not the README.

Local preview without a token: `node scripts/generate.mjs --data data/snapshot.json`

## Profile picture
The daily run embeds your GitHub avatar automatically. To use a different photo,
drop `avatar.jpg` (or .png) in the repo root — it takes priority.

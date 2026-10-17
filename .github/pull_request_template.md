<!--
The TITLE of this pull request becomes the squash commit, then the line users
read in CHANGELOG.md and in the GitHub Release. Write it in English, as a
Conventional Commit describing the change for the user:

  feat(widgets): show the date of old prices in the cheapest stations widget
  fix(official): read the forecast column when no price is announced
  perf: read the official prices only in Belgium and Luxembourg
  docs: explain the radius and the age of the prices

feat -> minor version, fix / perf -> patch, `!` or a "BREAKING CHANGE:" footer
-> breaking (a minor while the version is below 1.0.0). docs, chore, ci, test,
style, refactor and build alone publish no release. Never edit CHANGELOG.md.
-->

## What changes for the user

## How it was tested

- [ ] `npm run format:check`, `npm run lint` and `npm test` pass
- [ ] Tried in Gladys against carbu.com (Gladys version: …, country and postal code: …)
- [ ] The four docs (`docs/en.md`, `fr`, `de`, `es`) and READMEs are up to date

# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration** for Carbu.com, the fuel price
comparator of Belgium, France and Luxembourg: a Node.js service (Node 22+, ESM,
no build step) that runs in its own sandboxed Docker container and talks to
Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
its only runtime dependency. Carbu.com has **no API and no account**: the
integration reads the public pages a visitor reads (`https://carbu.com`), in
French, with a User-Agent naming the integration — the locality search
(JSON), one station list per followed fuel, and the official price table
(`/belgique/prixmaximum`, `/luxembourg/prixmaximum`). Transport: cloud only.

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/widgets.test.js          # one file
DEBUG=gladys-integration-sdk npm test     # with the SDK debug logs
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npx github:GladysAssistant/integration-store . --skip-image-check   # store checks
scripts/build-cover.sh                    # cover.jpg from docs/assets/cover.svg
docs/illustrations/render.sh              # docs/assets/widgets.<lang>.png
node .github/scripts/release.mjs next     # the version the next release would get
```

## Architecture

```
index.js                SDK wiring only (new GladysIntegration + createApp)
src/app.js              every handler, registered before connect(); the timer
src/carbu-api.js        HTTP client of carbu.com (locality search, station lists, official table)
src/parse.js            the pages -> localities, stations, official prices (pure, regex)
src/fuels.js            our fuel keys, the Carbu.com code per country, grade filters
src/prices.js           radius and age filters, ranking, lowest / average, texts
src/events.js           scene trigger transitions, payloads, scene action outputs
src/device.js           the area, station and official devices and their states
src/widgets.js          cheapest stations, price trend and official prices widgets
src/store.js            /data/carbu.json: localities, `seen`
src/time.js             local dates (TZ), ages in days
src/config.js           configuration (country, postal code, fuels, filters, interval, language)
src/i18n.js             runtime texts and fuel names, en / fr / de / es
gladys-assistant-integration.json   manifest
docs/{en,fr,de,es}.md   user documentation, re-hosted by the store
docs/illustrations/     generated widget images (render.sh, gen.mjs, render.js)
test/fixtures/          real pages of carbu.com (2026-10-17), reduced
.github/scripts/release.mjs         version, changelog, bump (tested in test/)
```

## Rules

- **External ids are forever**, and so is every key users store: device and
  feature external ids (`area:<area code of Carbu.com>`,
  `station:<country>-<station id>`, `official:<country>`, feature keys
  `<prefix>_<fuel key>`: never a label of Carbu.com), feature `category` /
  `type` / `unit` / `min` / `max` / `step`, the fuel keys of `src/fuels.js`,
  the keys of `config_schema`, `actions`, the widgets and their settings,
  scene triggers (fields, options, variables) and scene actions (fields,
  outputs). `test/structure.test.js` compares them to
  `test/fixtures/discovery.baseline.json`: never update the baseline to make a
  test pass without a documented migration.
- **Category / type pairs.** Prices are `currency` / `decimal` in `euro`,
  0 to 10 €/L; the cheapest station and the outlook are `text` / `text`
  (0 / 0). A price outside 0–10 is never published.
- **`should_poll` stays false**: the integration reads on its own timer, every
  `interval` (30 min to 4 h, 1 h by default), 10 min after a failure. A
  widget or a scene action reuses the last reading; a fuel that is not
  followed is read on demand and kept 30 minutes.
- **Be gentle with carbu.com.** One page per followed fuel (four at most) and
  one official table per reading, gzip, the honest User-Agent of
  `src/carbu-api.js`. A 403 or 429 is reported as a refusal in the status:
  never retry in a loop.
- **The pages can change.** Parsing lives in `src/parse.js` only, tested on the
  real pages of `test/fixtures/`. When Carbu.com changes its layout, save a new
  reduced page there (no ads, no scripts) and adapt the parser; an unreadable
  page is an `invalid` error with its own status message.
- **Prices of every age.** French stations can show prices years old: the
  `max_age` setting sets them aside (7 days by default), so does the radius
  (distance from the centre of the locality, given by Carbu.com).
- **Events once.** `seen` (in /data) remembers the cheapest station per fuel,
  the prices of the added stations, the official prices and the
  announcements / forecasts fired. The first reading is a baseline; a station
  just added is a baseline too. A scene action or a widget never fires an
  event. Official events cover every fuel of the table (scenes filter by fuel).
- **Source.** Keep "Carbu.com" and the time of the reading visible in the
  widgets, and the credit in the README, the docs and NOTICE.
- **The container rootfs is read-only.** Write only under `/data`.
- **Four languages.** Every user-facing text (manifest, runtime messages in
  `src/i18n.js`, `docs/*.md`, README) exists in English, French, German and
  Spanish. `test/i18n.test.js` checks it. Names and addresses of stations stay
  as Carbu.com writes them; scene variables carry the fuel name in English.
- **Widget images.** After any change to the content of a widget, run
  `docs/illustrations/render.sh` again and look at the four PNG files.
- **Versions belong to the Release workflow**: never edit `version` in
  `package.json`, the lockfile or the manifest, nor the `docker_image` tag.
  The version stays below 1.0.0 until the maintainer runs the Release workflow
  with `release-as: 1.0.0`.
- **Changelog.** Never edit CHANGELOG.md by hand, it is generated at the
  release. Write the PR title as the line the user will read.
- **Commits and PR titles** follow Conventional Commits, in English: `feat` ->
  minor, `fix` / `perf` -> patch, `!` or `BREAKING CHANGE:` -> major (minor
  below 1.0.0); `docs`, `chore`, `ci`, `test`, `style`, `refactor`, `build`
  release nothing.
- **Manifest.** Texts are objects `{ "en", "fr", "de", "es" }`; the catalog
  `description` holds 10 to 100 characters per language; the file stays under
  100 KB. A field older cores do not know needs a higher `gladys_version`
  minimum (see `src/constants.js` of the integration-store): widgets and scene
  triggers need 5.1.x (`>=5.1.1` here), a widget button form or a `houses`
  source would need 5.2.0. Transport: `["cloud"]`. No permission.
- **Forum drafts** (`.github/forum-*.md`) are never committed.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network (the fake site of
  `test/helpers/fixtures.js`).

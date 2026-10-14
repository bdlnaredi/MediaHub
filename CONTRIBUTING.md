# Contributing

Thanks for helping! A few notes to keep things smooth.

## Run it locally

You only need Node.js 20 or newer. There is nothing to install.

```
DATA_DIR=./data PORT=5080 node server.js
```

Then open http://localhost:5080. On Windows PowerShell:

```
$env:DATA_DIR="./data"; $env:PORT="5080"; node server.js
```

## Before you open a pull request

```
npm run check
npm test
```

Both must pass. The tests start real servers on free ports and use a temporary data folder, so they are safe to run.

To look at the app without any of your own apps, run `DEMO=1 node server.js` (see the README). The pretend apps live in `lib/demo.js` and are also what the feature tests use. When you add something that talks to an app, extend that file and add a test.

## Translating

Languages are plain files in `public/lang/` such as `de.json`. Each file maps the English text in the page to the translation. To improve one, edit the file. To add one:

1. Copy `public/lang/es.json` to `public/lang/xx.json` (the two-letter code) and translate the values. Keep the keys exactly as they are.
2. Add the language to the `LANGS` list near the top of the script in `public/index.html`.
3. Run `npm test`. It checks that every language has the same texts and that none are stale.

Texts built from several parts (such as "3 selected") are not covered yet and stay in English. If you change a visible English text in the page, search `public/lang/` for the old wording and update it.

## Ground rules

- **No runtime dependencies.** The server uses only Node's built-in modules, and the page uses plain JavaScript. This keeps the project easy to audit and update. If you think a dependency is really needed, open an issue to discuss it first.
- Anything that changes permissions, sign-in, backups or storage needs a test.
- Never log or return secrets (keys, passwords, tokens) from the server.
- Keep the page working on phones and in both light and dark themes.
- Keep wording friendly for people who are not technical.

## Reporting bugs

Please include your MediaHub version (Settings, then Account), the app and version involved (for example qBittorrent 5.0), and what you saw. Remove any keys or addresses you do not want to share.

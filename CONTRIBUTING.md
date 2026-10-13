# Contributing

Thanks for helping! A few notes to keep things smooth.

## Run it locally

You only need Node.js 20 or newer. There is nothing to install.

```
DATA_DIR=./data PORT=8080 node server.js
```

Then open http://localhost:8080. On Windows PowerShell:

```
$env:DATA_DIR="./data"; $env:PORT="8080"; node server.js
```

## Before you open a pull request

```
npm run check
npm test
```

Both must pass. The tests start real servers on free ports and use a temporary data folder, so they are safe to run.

## Ground rules

- **No runtime dependencies.** The server uses only Node's built-in modules, and the page uses plain JavaScript. This keeps the project easy to audit and update. If you think a dependency is really needed, open an issue to discuss it first.
- Anything that changes permissions, sign-in, backups or storage needs a test.
- Never log or return secrets (keys, passwords, tokens) from the server.
- Keep the page working on phones and in both light and dark themes.
- Keep wording friendly for people who are not technical.

## Reporting bugs

Please include your MediaHub version (Settings, then Account), the app and version involved (for example qBittorrent 5.0), and what you saw. Remove any keys or addresses you do not want to share.

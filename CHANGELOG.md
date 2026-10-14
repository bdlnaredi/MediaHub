# Changelog

All notable changes are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/), and versions follow [Semantic Versioning](https://semver.org/).

## [0.10.0] - 2026-10-14

The default port is now **5080** (was 8080). If you published 8080 before, either change the mapping to `5080:5080` or set `PORT=8080` and map `8080:8080`.

### Added
- Two-step sign-in with an authenticator app and recovery codes. Admins can switch it off for someone who lost their phone.
- Read-only status pages: private links for a wall tablet that show only the sections you choose.
- More alert channels (Pushover, Gotify, webhook and email, next to ntfy, Telegram and Discord), several at once, each with a test button. Your old single channel is converted automatically.
- Automatic daily backups inside the data folder, with a keep count, run-now, restore and delete.
- Weekly summary message, with preview and send-now.
- Library bulk edit: tick many items to monitor, unmonitor, search, change the quality profile or remove, and Sonarr presets (latest season only, future episodes only, all, none).
- Slow downloads while Plex is streaming (switches qBittorrent's alternative speed limits and restores them afterwards, and leaves them alone if you had already set them).
- Health page: warnings from Sonarr, Radarr, Lidarr, Readarr and Prowlarr, stuck downloads, missing counts and disk space.
- Requests: choose seasons, per-person limits, automatic approval for trusted profiles, and **Report a problem** (messages the admins and searches again).
- Music and books pages for Lidarr and Readarr: library, search and add, monitor, search for missing, remove.
- Subtitles page for Bazarr with a Search button per item and for everything shown.
- Prowlarr indexer health with Test and Test all.
- SABnzbd history with retry and remove, and adding an NZB file or address.
- Demo mode (`DEMO=1`) with built-in pretend apps and locked risky settings.
- Translations: Español, Deutsch, Français and हिन्दी. Untranslated text stays in English.
- Accessibility pass: skip link, dialog focus handling, accessible names for fields and icon buttons, and text contrast fixes in both themes.
- A compatibility table in the README that says which apps were checked against a real server.

### Changed
- Default port is 5080.
- Screens refresh less often when the browser tab is hidden and catch up when you return. Several viewers now share one short-lived download list instead of each asking qBittorrent.
- Alert settings are now a list of channels. The "reports" toggle covers problem reports from people.

## [0.9.0] - first public release

### Added
- Dashboard with live speeds, server meters, app status, "needs attention", upcoming releases and a customizable layout.
- Downloads: filters, search, bulk actions, per-file selection, categories and tags, speed limits and schedule, history, and torrent-to-library matching.
- RSS from qBittorrent: articles, mark as read, bulk actions, feeds and auto-download rules with preview.
- Library, Wanted, Upcoming (list and month calendar), Requests with approval, and Search for Sonarr and Radarr.
- Show window in the Library with every season and episode, quality and missing status, monitor switches for the series, each season and each episode (and movies), and season or episode searches.
- Plex, Tautulli, SABnzbd, Unraid, Jackett; status and links for Prowlarr, Bazarr, Lidarr and Readarr.
- Profiles with per-profile app access and permissions, signed-in devices, activity log, and phone alerts (ntfy, Telegram, Discord).
- Encrypted backup and restore, quick search (Ctrl+K), light and dark themes, compact menu and accent colors.

### Security
- App keys and passwords are encrypted on disk (AES-256-GCM). Passwords are hashed with scrypt and must be 8+ characters.
- Sign-in rate limiting, same-site cookies, cross-site request blocking, a strict content security policy and other headers.
- Proxy headers are ignored unless `TRUST_PROXY` is set. Optional `SETUP_TOKEN` protects first-run setup.
- Saves are atomic and a rolling `db.json.bak` is kept; a damaged database is never silently replaced.
- The container drops root after fixing folder ownership (`PUID` / `PGID`).

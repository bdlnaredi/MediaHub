# Changelog

All notable changes are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/), and versions follow [Semantic Versioning](https://semver.org/).

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

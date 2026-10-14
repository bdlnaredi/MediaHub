# Changelog

All notable changes are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/), and versions follow [Semantic Versioning](https://semver.org/).

## [0.14.0] - 2026-10-14

### Added
- **Manage containers properly.** The Unraid page now has a container table with live CPU, memory and network use for each container (streamed from Unraid while the page is open), search, filters (running, stopped, updates), sorting by CPU or memory, and the container's icon and a link to its web page.
- **Container updates.** Update one container, tick several and update them together, or **Update all**. Updates run in the background with a progress banner, so you can leave the page.
- **Bulk actions.** Tick containers to start, stop, restart or update them together. Pause and resume single containers.
- **Container watchdog** (on by default). Every 30 seconds MediaHub looks for containers that stopped on their own. A crashed container is started again and you get an alert. It gives up after 3 restarts in an hour so a broken container does not loop forever. Containers stopped on purpose (from MediaHub, or from Unraid with a normal exit) are only reported, never restarted. You can switch restarting off, choose containers it should never restart, and get told when a container's health check says it is unhealthy. Nothing is restarted while the array is stopped.
- **Virtual machines:** start, shut down, pause, resume, restart and force off.
- **Unraid notifications:** see unread Unraid notifications (alerts, warnings, info) and dismiss them one by one or all at once.
- Logs viewer: filter lines and refresh.
- Needs attention now lists container updates, unread Unraid alerts and containers that stopped unexpectedly.

### Changed
- Array and share sizes on the Unraid page are shown in TB instead of very large GB numbers.
- Stopping, restarting or updating MediaHub's own container asks first and says the page will reconnect.

### Notes
- Live container usage and one-click updates need a newer Unraid API than the one Unraid 7.2 first shipped with. On an older API the rest of the page works and those parts show a short message saying an update to Unraid (or the Unraid Connect plugin) adds them.
- For VMs and notifications the Unraid API key needs those permissions. Without them, that section explains what is missing.
- The new parts follow Unraid's published GraphQL schema and were tested against built-in pretend apps, not yet against a real server. Please report anything that looks wrong, with your Unraid version.

## [0.13.0] - 2026-10-14

### Added
- **Forgot password.** A "Forgot password?" link on the sign-in page. Profiles can save a recovery email (Settings, then Account, needs the current password). The reset link is single use, valid for 30 minutes, signs the profile out everywhere and keeps two-step sign-in on. The reply never reveals which names exist, requests are rate limited, and the secret sits after the `#` in the link so it stays out of server logs. Email goes through your existing email alert channel; the address in the link is `PUBLIC_URL` or the address the admin used.
- **Library artwork everywhere.** A featured hero with Ken Burns backdrops and a poster strip, "Recently added" and "Top rated" poster rows, an animated poster wall with counters, a blurred backdrop behind the whole app, rating badges, posters that tilt with a light glare, backdrops in detail windows, fade-in images and page transitions. All of it respects "reduce motion".
- **Sign-in wallpaper from your library.** Backdrops are saved from Sonarr and Radarr into `wallpapers` (16 at a time, rotated every six hours) and fade behind the sign-in card. A switch in Settings, then Account, chooses between library artwork and the built-in scenes. No titles are exposed to signed-out visitors.
- New admin options in Settings, then Account: sign-in wallpaper source, the address used in emails, and a test email.

### Fixed
- The bottom dock on phones did nothing when tapped (only "More" worked).
- Toggle switches looked like large ovals inside phone bottom sheets.

## [0.12.0] - 2026-10-14

### Added
- **New look across the whole app.** Glass panels over a soft aurora background, rounded floating sidebar, gradient buttons, tiles with a coloured glow, and dialogs that slide up as sheets on phones.
- **Phone friendly.** A top bar and a bottom dock (with a More sheet) replace the sidebar on small screens, and tiles use two columns.
- **Changing sign-in wallpaper.** Six built-in scenes fade into each other behind the sign-in card. To use your own, put JPG, PNG or WebP files (under 12 MB, up to 40) in a `wallpapers` folder inside your data folder.
- **Interactive status page builder** in Settings: section cards, a message at the top, a Dark, Light or Match device look, and a live preview you can switch between phone, tablet and wall screen. Existing pages can be edited, and "New address" replaces a link that leaked.
- The public status page is redesigned: status ring, hover details on uptime bars, pause button, full screen, and a kiosk mode (`?kiosk=1`).

### Changed
- Status page code is shared between the public page and the Settings preview (`statuskit.js` and `statuskit.css`).

## [0.11.0] - 2026-10-14

### Added
- **Live dashboard.** One shared live stream (server-sent events) now updates the dashboard about every two seconds instead of each part asking on its own timer. A "Live" badge shows the connection, and the page falls back to asking by hand if the stream is blocked, for example by a proxy that buffers responses.
- New dashboard tiles: download and upload speed with graphs (the recent history is kept on the server, so a fresh page opens already filled in), who is watching, server CPU and memory, array space, Usenet speed, and requests waiting. Tiles open the matching page, and numbers glide instead of jumping.
- **Who is watching** now shows the poster, a progress bar that moves smoothly between updates, direct play, direct stream or transcoding, resolution, bandwidth, and whether the viewer is at home or remote.
- **Uptime history.** Each app shows a 48-hour uptime bar and percentage on the dashboard and on status pages. It is kept in `uptime.json` in the data folder.
- **Stats page** with posters (most watched movies and shows), a plays-per-day chart, busiest hours, devices, viewer avatars, total plays and time watched, and recent plays with posters. Every chart has a "View as table" view and hover details.
- Status pages refresh every four seconds, show an all-clear banner, uptime bars and a speed graph, and can optionally show how many people are watching (titles only, never names or devices).
- The demo now includes pretend Unraid and richer Tautulli and Plex data.

### Changed
- The Dashboard sections are now: needs attention, live tiles, who is watching, downloading now, Usenet, apps, and coming up. If you had customised the order, it is reset to the new defaults for sections that no longer exist.
- New logo and icons.

### Fixed
- Image requests for Plex and Tautulli posters now refuse paths that try to climb out of the library folder.
- Two graphs on one page no longer share the same element id.

### Notes
- The new Plex session details and Tautulli chart data follow the documented APIs and were tested against built-in pretend apps. They have not yet been checked against a real Plex or Tautulli. Please report anything that looks wrong, with your app versions.

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

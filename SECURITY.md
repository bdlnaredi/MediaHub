# Security policy

MediaHub can start, stop and remove things on your server, so security matters here.

## Reporting a problem

Please **do not open a public issue** for a security problem.

Use GitHub's private reporting instead: open the **Security** tab of this repository and choose **Report a vulnerability**. Include what you found, how to reproduce it, and which version you used. I will answer as soon as I can, and I will credit you in the release notes if you wish.

## Supported versions

Only the latest release receives security fixes. Please update before reporting.

## What MediaHub does to protect you

- Passwords are hashed with scrypt. App keys and passwords are encrypted on disk with AES-256-GCM using a key kept in your data folder.
- Sign-ins are rate limited. Cookies are `HttpOnly` and `SameSite=Strict` (and `Secure` over HTTPS).
- Requests from other websites are blocked, and a strict content security policy is sent.
- Two-step sign-in (TOTP) is available for every profile. Codes can only be used once, wrong codes are limited, and recovery codes are stored hashed and work once.
- Read-only status page links use a 192-bit random secret stored only as a hash, are rate limited, and show only the sections chosen. They can be removed at any time.
- Alert channel secrets and two-step secrets are encrypted on disk like your app keys.
- Demo mode (`DEMO=1`) keeps everything in memory, never touches your data folder's database, and locks settings that could be abused.
- The container runs as a normal user, not root.
- There are no third-party runtime dependencies, which keeps the attack surface and supply chain small.

## What you should do

1. **Do not expose MediaHub to the internet over plain HTTP.** Use Tailscale, a Cloudflare Tunnel, or a reverse proxy with HTTPS.
2. Set `SETUP_TOKEN` before the first run if the port is reachable by anyone else.
3. Set `TRUST_PROXY=true` only when MediaHub is behind a proxy you control.
4. Use a strong, unique password for the admin account, and turn on two-step sign-in.
   Treat status page links like passwords: anyone with the link can see what it shows.
5. Back up your data folder, including `secret.key`, and keep backups private.
6. Give each family member their own profile with only the permissions they need.
7. Keep the image updated.

## Scope notes

MediaHub stores the API keys of your other apps so it can talk to them. Anyone who gets both your data folder and `secret.key`, or an admin session, can read them. Treat both as secrets.

Automatic backups in the `backups` folder are plain copies of `db.json` (their secrets are still encrypted with `secret.key`). They are as private as the data folder itself, so do not copy them somewhere public. Use the passphrase-locked backup download for copies that leave your server.

An admin can configure alert channels (webhook and email) that make the server send requests to addresses of their choosing. That is intended for admins, and regular profiles cannot do it.

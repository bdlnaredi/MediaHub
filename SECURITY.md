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
- The container runs as a normal user, not root.
- There are no third-party runtime dependencies, which keeps the attack surface and supply chain small.

## What you should do

1. **Do not expose MediaHub to the internet over plain HTTP.** Use Tailscale, a Cloudflare Tunnel, or a reverse proxy with HTTPS.
2. Set `SETUP_TOKEN` before the first run if the port is reachable by anyone else.
3. Set `TRUST_PROXY=true` only when MediaHub is behind a proxy you control.
4. Use a strong, unique password for the admin account.
5. Back up your data folder, including `secret.key`, and keep backups private.
6. Give each family member their own profile with only the permissions they need.
7. Keep the image updated.

## Scope notes

MediaHub stores the API keys of your other apps so it can talk to them. Anyone who gets both your data folder and `secret.key`, or an admin session, can read them. Treat both as secrets.

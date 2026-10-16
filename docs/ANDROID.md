# MediaHub for Android

A small app named **MediaHub** that opens your own MediaHub server full screen, with its own icon. It is not a second copy of MediaHub: the server still runs in Docker (on your Unraid box, for example), and the app is the window onto it. Everything that is in MediaHub is in the app, because the app shows the real page.

## Get the app (no Android Studio needed)

1. On GitHub, open the repository, then **Actions**, then **Android app** on the left.
2. Press **Run workflow**, and wait a few minutes until the run turns green.
3. Open the finished run and download **mediahub-apk** at the bottom. Unzip it to get `mediahub.apk`.
4. Copy `mediahub.apk` to your phone and open it. Android asks once to allow installs from that app (for example Files or Chrome). Allow it, then install.

To get a download link on the **Releases** page instead, create a tag that starts with `app-v`, for example `app-v1.0.0`, and push it. The same build runs and attaches `mediahub.apk` to the release. (Tags that start with `v` are for the server image and do not build the app.)

## Or build it yourself in Android Studio

1. Open Android Studio, choose **Open**, and pick the `android` folder inside this repository.
2. Wait until it finishes syncing (the first time takes a while, it downloads what it needs).
3. Choose **Build, Build Bundle(s) / APK(s), Build APK(s)**. When it finishes, press **locate** to find `app-debug.apk`.

## First start

The app asks for the address of your MediaHub server, for example `192.168.1.10:5080` or `https://media.example.com`. It checks that MediaHub answers there, remembers it, and opens it. Sign in as usual, including **Sign in with Plex**.

- **At home** the phone must be on the same network as the server. `http://` addresses are fine.
- **Away from home** you need a way in, such as a VPN (Tailscale, WireGuard) or a reverse proxy with a real `https://` certificate. A certificate your phone does not trust is refused on purpose.
- To change the server later, **press and hold the app icon and choose Change server**, or use **Change server** on the error screen.
- The back button goes back inside MediaHub, and leaves the app from the first page.

## What is different from the website

- Links that leave your server (IMDb, TMDB, Trakt, torrent pages) open in your phone's browser.
- **Sign in with Plex** opens Plex in your browser. After signing in there, go back to the app and it finishes by itself.
- File pickers work (for example adding an NZB file).
- **Downloads do not work in the app yet**, for example saving a backup file. Do that from a browser.
- There are no push messages from the app itself. Phone messages through ntfy or Discord keep working as before.

## About the signing key

Android only installs a new version over an old one if both are signed with the same key. So the key, `android/app/mediahub.keystore`, is kept in the repository on purpose, with the password `mediahub`. That is fine for installing your own copy on your own phones. It also means anyone could build an app that looks like an update to yours, so only install `mediahub.apk` that you got from your own repository. Do not use this key to publish on the Google Play Store. If you ever want a private key, create one with Android Studio (**Build, Generate Signed App Bundle or APK**) and put it in GitHub under **Settings, Secrets**.

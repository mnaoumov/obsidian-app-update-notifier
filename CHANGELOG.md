# CHANGELOG

## 1.0.0

- Watches all three Obsidian release streams — the app, the insider (Catalyst) build and the installer — and reports what is behind in the status bar.
- Announces each new version exactly once, with a changelog link, resolved from Obsidian's changelog feed even for versions with no public GitHub release.
- Warns when the bundled Electron is below the floor Obsidian itself checks, and shows the Electron span between the installed and available installer.
- Offers both update routes: the new installer for your operating system and architecture, and the app-only path through Settings → General → Check for updates.
- Gates the Catalyst row on what is needed rather than on what you lack, since Obsidian exposes no way to read a license.
- Adds a `Check for updates now` command; checks otherwise run at startup and hourly, with a configurable interval.
- Never installs anything.

# The installer and Electron

The installer is the version nothing tells you about, and it is the one that quietly decides which Obsidian features work on your machine.

Obsidian ships as two pieces. The **installer** is the executable you downloaded and ran; it bundles a version of Electron, which is the browser engine everything renders in. The **app** is the `obsidian.asar` bundle the installer loads, and it is the only piece automatic updates replace. So the app can march forward through a dozen releases while the Electron underneath it stays exactly as old as the day you installed.

Look at the two versions on this machine:

```code-button
---
caption: Show me the app, the installer and Electron
---
console.log(require('/demoSetup.ts').showThisMachine());
```

## What an old installer actually costs

Obsidian gates features on a minimum Electron version. When yours is below it, some features are simply absent — not broken with an error, absent — and nothing in the interface connects that absence to your installer. Obsidian knows: its own debug information carries the line *"Update installer: installer version too low, please download and reinstall"*. But you only ever see that if you go and generate a debug report, which nobody does until something has already gone wrong.

The floor is Electron **28.2.3**. The plugin compares against that number, and when you are below it the details panel says so and links the download page. Where a published index records a different floor for the exact Obsidian you are running, that one is used instead — the hard-coded number is the fallback, not the only answer.

One piece of pedantry worth knowing, because the plugin deliberately does not repeat it: Obsidian labels that check "installer version too low", but what it actually compares is the **Electron** version. They usually move together, and they are not the same thing. The panel names Electron, because that is what is being measured.

## Reinstalling is not the same as updating

There is no in-app path to a newer installer. You download the current one from Obsidian's site and run it. Your vaults, settings and plugins are untouched — the installer replaces the executable, not your data — but it is a manual step that only happens if somebody tells you it is due. That is the whole reason this stream is watched.

```code-button
---
caption: Check for updates now
---
require('/demoSetup.ts').checkForUpdatesNow(app);
```

If the Installer row says an update is available, it now offers **Update with new installer (recommended)** — a link built the same way Obsidian's own recommendation builds it, carrying the operating system and architecture of the machine you are on, so you land on the right installer rather than picking one.

## The Electron you would move to

Beside that link, when it can be established, the panel names both ends of the jump: *Your Electron version 34.5.8, latest installer has Electron version 39.8.3*, and offers the releases in between as links to Electron's own release notes. That span is collapsed to one release per major when it is long — someone several years behind crosses well over two hundred Electron releases, and a wall of two hundred links helps nobody — and the panel says how many it left out rather than quietly showing you a dozen and letting you assume that was all of them.

Right now you will most likely see only your own version and nothing about the newest installer's. That is deliberate, not a bug. Obsidian does not publish which Electron an installer bundles anywhere a program can read, and the one public index that used to record it has stopped being filled in for current releases. Rather than guess, or print "unknown", the plugin stays quiet about the half it cannot establish — and starts showing it the day that data comes back, with no update to this plugin needed.

## Turning it off

The installer stream is desktop-only, and on mobile it is not shown at all. On desktop you can switch it off if you genuinely do not want to hear about it:

```code-button
---
caption: Stop watching the installer
---
await require('/demoSetup.ts').changeSettings(app, { shouldWatchInstallerStream: false });
```

```code-button
---
caption: Watch the installer again
---
await require('/demoSetup.ts').changeSettings(app, { shouldWatchInstallerStream: true });
```

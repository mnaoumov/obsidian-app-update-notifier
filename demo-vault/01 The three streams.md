# The three streams

"Is Obsidian up to date?" has three answers, not one, and they can all be different at the same moment. This plugin watches each of them separately and tells you which one moved.

Run a check and read the panel while you read this page:

```code-button
---
caption: Check for updates now
---
require('/demoSetup.ts').checkForUpdatesNow(app);
```

## App

The **app** is the `obsidian.asar` bundle Obsidian loads at startup. It is what automatic updates replace, it is what changes when you read a release announcement, and it is what `Platform.version` reports. This is the stream everyone means by "the Obsidian version".

The plugin reads it from `desktop-releases.json` — the same file Obsidian's own updater reads. On Android it reads the newest release that shipped an `.apk` instead, because the desktop file says nothing about mobile.

## Insider build

The **insider build**, also called Catalyst or early access, is the same app published days ahead of the public release to people who have the Catalyst license. Watching it only makes sense if you can actually install it, so by default the plugin asks Obsidian whether your insider setting is on and follows the answer. You can override that either way — see [05 Settings](<./05 Settings.md>).

An insider version is a real, released version that never appears in the public list. Version 1.13.5 is one: it exists, it has a changelog, and it has no public GitHub release at all. The plugin resolves its changelog from Obsidian's changelog feed rather than from a release, so a Catalyst version still arrives with somewhere to read.

## Installer

The **installer** is the executable that was installed on this machine — the `.exe`, `.dmg`, `.AppImage` or `.deb`. It is what `Platform.build` reports, and **automatic updates never touch it**. Obsidian can update its app bundle indefinitely while the installer underneath stays at whatever version you first installed, which is how a machine ends up years behind without anything ever saying so. This stream is desktop-only; on mobile there is no such distinction.

Press the button on [00 Start](<./00 Start.md>) again and compare the first two lines. If they differ, the difference has been there the whole time and nothing told you.

## Why the newest release is not always the answer

The plugin does not take "the newest release" as the installer version, and it is worth knowing why. Obsidian publishes desktop and mobile from the same GitHub repository, so the newest release is sometimes mobile-only: version 1.13.8 shipped one file, `Obsidian-1.13.8.apk`, while the newest desktop installer was still 1.13.7. Reporting 1.13.8 as an available installer would send you looking for a download that does not exist. The plugin decides by looking at what a release actually published.

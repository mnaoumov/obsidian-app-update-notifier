# Being notified

A notifier that interrupts you every hour is a notifier you turn off, so this one is built to be quiet. There is a status bar item you can look at whenever you want, and exactly one notice per release, ever.

## The status bar item

At the bottom of the window the plugin keeps one item. It says **Obsidian: up to date**, or it counts what is behind — **Obsidian: 2 updates** — and it does not change color or move until something actually changes. Before the first successful check it says **Obsidian: not checked**, which is a different statement from "up to date" and is deliberately not dressed up as one.

Clicking it opens the details panel: every stream being watched, what is installed against what is published, and a changelog link for each.

```code-button
---
caption: Hide the status bar item
---
await require('/demoSetup.ts').changeSettings(app, { shouldShowStatusBarItem: false });
```

Look at the status bar — the item is gone immediately, without waiting for the next check.

```code-button
---
caption: Show it again
---
await require('/demoSetup.ts').changeSettings(app, { shouldShowStatusBarItem: true });
```

On iOS the item is hidden whatever this setting says, because Obsidian publishes no release feed for iOS and the only honest thing the item could report there is "unknown".

## One notice per version, ever

When a check finds a version it has not told you about, it shows a single notice naming the version, linking its changelog, and offering the two ways to take it. Then it writes that version down and never mentions it again — not on the next check, not after a restart, not after a reload. A release you have already been told about is not news.

## What a notice offers you

A notice that only says "1.13.7 is out" leaves you to work out what to do about it, so each one carries the routes as well:

- **Update with new installer (recommended)** — a link to the download page for your operating system and architecture. This is the route that also moves the Electron underneath Obsidian, which is why it is the recommended one; see [03 The installer and Electron](<./03 The installer and Electron.md>) for why that matters.
- **Update app only, without installer** — the path to Obsidian's own updater, `Settings → General → Check for updates`. This replaces the `obsidian.asar` bundle and leaves your installer exactly where it was.

The second one is a path you follow rather than a button that does it for you, and that is a deliberate limitation rather than an oversight. Obsidian's own **Check for updates** button is wired to machinery a plugin has no supported way to reach; the only way to press it would be to find it by its visible text, which would break the moment you used Obsidian in another language. Naming the path works in every language and cannot rot.

### When the new version is a Catalyst build

An insider build is only installable by [Catalyst](https://obsidian.md/help/early-access) supporters, so a notice about one says what is needed rather than offering a route that would not work: *Installing this build needs a Catalyst license, with insider builds switched on in Settings → General.*

Note what it does **not** say. It never tells you that you have no Catalyst, because the plugin genuinely cannot tell. Obsidian keeps the license itself out of reach of plugins; all that is readable is whether the insider setting is switched on. When it is on you must have a license — Obsidian hides the setting entirely otherwise — so the notice offers the install route. When it is off, that could equally mean you hold a license and simply turned the setting off, and the wording is written to be correct for both readers.

That is easy to describe and hard to see, because by the time you read this the plugin has almost certainly already told you about everything it knows. So this button forgets:

```code-button
---
caption: Forget which versions I have been told about
---
await require('/demoSetup.ts').forgetAnnouncedVersions(app);
```

```code-button
---
caption: Now check again
---
require('/demoSetup.ts').checkForUpdatesNow(app);
```

If anything is behind, you get the notices again. Press the check button a second time without forgetting first, and you get none — which is the actual feature.

The record lives in the plugin's own `data.json`, under `notifiedVersions`, as one entry per stream. One entry, not a history: it holds the newest version you were told about and nothing else, so it cannot grow however long the plugin runs.

## How often it looks

By default the plugin checks once an hour, which is what Obsidian's own updater does, plus once when Obsidian starts. You can make it slower, or turn scheduled checks off entirely and use the command when you feel like it — see [05 Settings](<./05 Settings.md>).

```code-button
---
caption: Check only when I ask
---
await require('/demoSetup.ts').changeSettings(app, { checkIntervalInMinutes: 0 });
```

```code-button
---
caption: Back to hourly
---
await require('/demoSetup.ts').changeSettings(app, { checkIntervalInMinutes: 60 });
```

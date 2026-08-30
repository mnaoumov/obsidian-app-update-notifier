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

When a check finds a version it has not told you about, it shows a single notice naming the version and linking its changelog. Then it writes that version down and never mentions it again — not on the next check, not after a restart, not after a reload. A release you have already been told about is not news.

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

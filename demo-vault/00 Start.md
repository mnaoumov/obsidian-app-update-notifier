# Start here

Welcome to the [App Update Notifier](https://github.com/mnaoumov/obsidian-app-update-notifier/) demo vault. Obsidian has a setting that turns automatic updates off, and a lot of people use it — an update that arrives mid-thought is an interruption, and an update that arrives before a plugin you depend on has caught up is worse. What that setting does not say is that it also stops Obsidian *checking*: with it off, nothing tells you a release happened at all. This plugin does the checking and nothing else. It never installs anything.

**Your first success:** the grey rectangle below with a caption on it is a **code button**. **Clicking it runs the code it contains**, and the result appears underneath it. The `</>` toggle beside the caption reveals the source, so you can always read what a button is about to do before you press it. Press this one — it prints what this machine is actually running, read straight out of Obsidian.

```code-button
---
caption: Show me what this machine is running
---
console.log(require('/demoSetup.ts').showThisMachine());
```

On desktop you should see four lines, and the interesting thing is that the first two can disagree. The app version and the installer version are separate things that move separately, which is the subject of most of this vault.

Now ask the plugin what it has found:

```code-button
---
caption: Check for updates now
---
require('/demoSetup.ts').checkForUpdatesNow(app);
```

That runs a real check and opens the details panel. It is the same thing the **App Update Notifier: Check for updates now** command does, and the same panel you get by clicking the plugin's status bar item.

If a page leaves a setting somewhere you did not intend, this puts them all back:

```code-button
---
caption: Put every setting back to its default
---
await require('/demoSetup.ts').restoreDefaults(app);
```

## What Obsidian publishes

- [01 The three streams](<./01 The three streams.md>) — the app, the insider build and the installer, and why they are three separate answers.
- [02 When automatic updates are off](<./02 When automatic updates are off.md>) — the case this plugin exists for.

## What an old installer costs you

- [03 The installer and Electron](<./03 The installer and Electron.md>) — the version that silently withholds features.

## Being told

- [04 Being notified](<./04 Being notified.md>) — the status bar item, the details panel, and the promise that a release is announced exactly once.
- [05 Settings](<./05 Settings.md>) — every setting, by the key it is stored under.

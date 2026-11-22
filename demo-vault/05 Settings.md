# Settings

Every setting the plugin owns, by the key it is stored under in `data.json`, grouped by the section it appears in on the settings tab. Open the tab with **Settings -> Community plugins -> `App Update Notifier`**.

## Checking

- `checkIntervalInMinutes`
  - how often to check, in minutes. Defaults to `60`, which is what Obsidian's own updater uses. `0` switches scheduled checks off and leaves only the command. Anything else must be a whole number of at least `15`, which keeps three requests per check comfortably inside `GitHub`'s limit of sixty an hour.

## Streams

- `betaStreamMode`
  - when to watch the insider (Catalyst) channel. `auto`, the default, reads Obsidian's own insider setting and follows it, so a vault without Catalyst is never told about a build it cannot install. `always` watches it regardless; `never` ignores it regardless.
- `shouldWatchInstallerStream`
  - whether to watch the installer version, which updates separately from the app and carries the bundled Electron. Defaults to on. Desktop only — on mobile there is no installer version to compare.

## Notifications

- `shouldShowStatusBarItem`
  - whether the status bar carries the item that says what is out of date. Defaults to on. Each new version is still announced once with a notice whatever this is set to.
- `releaseWaitInDays`
  - how many days a new release must have been out before it is announced or counted in the status bar. Defaults to `0`, which announces it at once; the settings tab offers `1`, `3`, `7` and `14`. A newer release on the same stream starts the wait again, and the details panel still lists a waiting release with the date its wait ends. [04 Being notified](<./04 Being notified.md>) has buttons to try it.

## Not a setting, but stored beside them

- `notifiedVersions`
  - the newest version already announced for each of the three streams, so a release is announced exactly once, ever. It is state rather than a choice, and it does not appear on the settings tab. One entry per stream and no history, so it cannot grow. [04 Being notified](<./04 Being notified.md>) has a button that clears it.

## Putting them back

```code-button
---
caption: Restore every default
---
await require('/demoSetup.ts').restoreDefaults(app);
```

# When automatic updates are off

Obsidian's **Settings -> General -> Automatic updates** toggle does two things, and only one of them is in its name. Turning it off stops Obsidian installing updates, which is what you asked for. It also stops Obsidian *looking*, which you probably did not — and from then on nothing tells you a release happened.

That is the gap this plugin fills. It keeps checking whatever that toggle says, and it never installs anything, so turning automatic updates off costs you nothing but the install.

Read the toggle as this machine currently has it:

```code-button
---
caption: Is Obsidian checking for updates?
---
console.log(require('/demoSetup.ts').showThisMachine());
```

The last line is Obsidian's own setting, read directly. This plugin only ever **reads** it — it will never turn your automatic updates back on, and there is no setting here that could.

## Try it

Turn automatic updates off in **Settings -> General**, then run a check:

```code-button
---
caption: Check for updates now
---
require('/demoSetup.ts').checkForUpdatesNow(app);
```

The panel is exactly as complete as it was before. Nothing about the plugin's answer depends on Obsidian's setting.

## Where the answer comes from

The plugin reads the same public sources Obsidian's own updater does, over `requestUrl` rather than `fetch` so no CORS header can block it:

- `desktop-releases.json`
  - the app and insider versions, from the file Obsidian's updater itself reads.
- the GitHub releases of `obsidianmd/obsidian-releases`
  - which versions shipped a desktop installer, and the changelog link each release publishes.
- Obsidian's changelog feed
  - the changelog for a version that has no public release, which is how an insider version still arrives with somewhere to read.

That is three requests per check. At the default hourly interval it is three an hour, against a limit of sixty, and the plugin refuses an interval short enough to threaten that. A check that fails — because you are offline, or because the network hiccupped — is silent: it keeps the last answer it had rather than replacing it with a guess, and it never says "up to date" when what it means is "could not tell". The one exception is a check *you* asked for, which reports its own failure, because you are standing there waiting for an answer.

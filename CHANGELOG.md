# CHANGELOG

## 1.0.4

- build: merge moving off obsidian-dev-utils onto the @mnaoumov packages
- docs: mark plugin names as code in comments
- refactor: merge reading Platform versions and IPC toggles through obsidian-typings
- test: merge using the obsidian-typings declarations of Obsidian internals

## 1.0.3

- test(screenshots): merge the dark theme set through applyObsidianTheme
- test(screenshots): merge desktop frame 1 re-shot without the search caret
- docs(screenshots): merge the three frames re-shot under the opaque band
- test(screenshots): merge the first-check wait before the settings-panel shot
- test(screenshots): merge the shortened captions that overflowed their frames
- chore(deps): merge the obsidian-integration-testing 17 float
- chore(deps): merge the obsidian-test-mocks 7.0.0 raise
- fix(test): merge the headless demo-vault toolkit install
- fix(deps): restore the lockfile's missing resolved and integrity fields
- docs(release-streams): record that Obsidian ships one Catalyst version line
- fix(mobile): name a Catalyst route a phone has, not the desktop About tab
- test(screenshots): drop the settings-popout workaround the harness now owns
- fix(mobile): offer one update route instead of two desktop-only ones
- fix(test): pin the capture run's Obsidian so shot 2 cannot silently degrade
- build(markdownlint): forbid hard-wrapped markdown paragraphs
- chore(deps): drop the dead type-fest override
- chore(deps): drop the dead markdown-it override
- chore(deps): drop the dead js-yaml override
- style(comments): stop capitalizing the middle of a wrapped comment
- docs: replace the private rule-id citations with what they assert
- docs: name the library and the sibling plugins so a reader can resolve them
- docs: replace the private tracker references with what they pointed at
- chore(deps): move to obsidian-dev-utils 103
- chore: adopt the npm run gate branch gate
- docs: say where the debug command is run
- docs: name the unversioned demo-vault asset and the folder it unzips into
- chore: make the LICENSE copyright line checkable by the linter and guard it against the year roll-over
- test(test-mocks): drop the hand-rolled app.plugins stub, and sweep the dependencies
- fix(test): capture the settings shot in the main window, not a popout
- test: land the pollInObsidian conversion for the real-feed suites
- fix(build): wire build:compile to buildCompile and drop the duplicate leaf script

## 1.0.2

- chore(deps): sweep caret-ranged dependencies to latest
- fix(deps): move to obsidian-integration-testing 11 and obsidian-dev-utils 96.5.2
- fix(deps): drop the brace-expansion file: override that breaks a clean install
- docs: point installation at the published community listing

## 1.0.1

- docs: update changelog
- fix(manifest): reword the description the directory rejects for naming Obsidian
- docs: link the changelog now that 1.0.0 exists

## 1.0.0

- Watches all three Obsidian release streams — the app, the insider (Catalyst) build and the installer — and reports what is behind in the status bar.
- Announces each new version exactly once, with a changelog link, resolved from Obsidian's changelog feed even for versions with no public GitHub release.
- Warns when the bundled Electron is below the floor Obsidian itself checks, and shows the Electron span between the installed and available installer.
- Offers both update routes: the new installer for your operating system and architecture, and the app-only path through Settings → General → Check for updates.
- Gates the Catalyst row on what is needed rather than on what you lack, since Obsidian exposes no way to read a license.
- Adds a `Check for updates now` command; checks otherwise run at startup and hourly, with a configurable interval.
- Never installs anything.

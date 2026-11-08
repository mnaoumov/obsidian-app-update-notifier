# CHANGELOG

## 1.1.0

This release has 1 new feature and 4 documentation changes. 8 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### New

- add a Report a bug command

### Documentation

- **readme:** point bug reports at the Report a bug command
- add issue-filing instructions for AI agents
- **readme:** combine related resources and plugin comparisons
- add a Similar plugins section to the README

## 1.0.5

This release has 3 documentation changes. 5 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### Documentation

- shorten the debugging section
- **readme:** lead the Debugging section with `Advanced Debug Mode`
- mark plugin names as code

## 1.0.4

This release has 1 documentation change. 3 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### Documentation

- mark plugin names as code in comments

## 1.0.3

This release has 7 fixes and 7 documentation changes. 17 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### Fixed

- **test:** merge the headless demo-vault toolkit install
- **deps:** restore the lockfile's missing resolved and integrity fields
- **mobile:** name a Catalyst route a phone has, not the desktop About tab
- **mobile:** offer one update route instead of two desktop-only ones
- **test:** pin the capture run's Obsidian so shot 2 cannot silently degrade
- **test:** capture the settings shot in the main window, not a popout
- **build:** wire build:compile to buildCompile and drop the duplicate leaf script

### Documentation

- **screenshots:** merge the three frames re-shot under the opaque band
- **release-streams:** record that Obsidian ships one Catalyst version line
- replace the private rule-id citations with what they assert
- name the library and the sibling plugins so a reader can resolve them
- replace the private tracker references with what they pointed at
- say where the debug command is run
- name the unversioned demo-vault asset and the folder it unzips into

## 1.0.2

This release has 2 fixes and 1 documentation change. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

### Fixed

- **deps:** move to `obsidian-integration-testing` 11 and `obsidian-dev-utils` 96.5.2
- **deps:** drop the brace-expansion file: override that breaks a clean install

### Documentation

- point installation at the published community listing

## 1.0.1

This release has 1 fix and 2 documentation changes.

### Fixed

- **manifest:** reword the description the directory rejects for naming Obsidian

### Documentation

- update changelog
- link the changelog now that 1.0.0 exists

## 1.0.0

- Watches all three Obsidian release streams — the app, the insider (Catalyst) build and the installer — and reports what is behind in the status bar.
- Announces each new version exactly once, with a changelog link, resolved from Obsidian's changelog feed even for versions with no public `GitHub` release.
- Warns when the bundled Electron is below the floor Obsidian itself checks, and shows the Electron span between the installed and available installer.
- Offers both update routes: the new installer for your operating system and architecture, and the app-only path through Settings → General → Check for updates.
- Gates the Catalyst row on what is needed rather than on what you lack, since Obsidian exposes no way to read a license.
- Adds a `Check for updates now` command; checks otherwise run at startup and hourly, with a configurable interval.
- Never installs anything.

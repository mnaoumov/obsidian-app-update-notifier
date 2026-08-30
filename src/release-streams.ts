/**
 * @file
 *
 * The three release streams the plugin watches, resolved as pure functions over an already-fetched
 * {@link ReleaseFeeds} and an already-read {@link PlatformSnapshot}. Nothing here fetches or touches
 * `Platform`, so every rule below — which feed answers which stream, and the traps in each — is
 * testable without a network or an app.
 */

import {
  lt,
  valid
} from 'semver';

import type {
  ChangelogEntry,
  DesktopReleases,
  GitHubRelease
} from './obsidian-releases-api.ts';

import {
  CHANGELOG_INDEX_URL,
  ChangelogPlatform,
  findChangelogUrl,
  findLatestAndroidVersion,
  findLatestDesktopInstallerVersion,
  getReleaseChangelogUrl
} from './obsidian-releases-api.ts';

/**
 * The three streams. The string values are persisted as keys of the notified-versions record, so they
 * are part of the plugin's stored data and must not be renamed.
 */
export enum ReleaseStreamId {
  App = 'app',
  Beta = 'beta',
  Installer = 'installer'
}

/**
 * What this plugin knows about the running Obsidian, read once per check via `platform-ex.ts`.
 */
export interface PlatformSnapshot {
  /**
   * The running app version.
   */
  readonly appVersion: null | string;

  /**
   * The Electron version the installer bundled, or `null` on mobile.
   */
  readonly electronVersion: null | string;

  /**
   * The installed executable's version, or `null` on mobile.
   */
  readonly installerVersion: null | string;

  /**
   * Whether this is the Android app.
   */
  readonly isAndroidApp: boolean;

  /**
   * Whether this is the Electron desktop app.
   */
  readonly isDesktopApp: boolean;
}

/**
 * Everything one check fetched, handed to the stream resolvers together so they cannot disagree about
 * the state of the same check.
 */
export interface ReleaseFeeds {
  /**
   * The changelog feed's entries, newest first.
   */
  readonly changelogEntries: readonly ChangelogEntry[];

  /**
   * `desktop-releases.json`.
   */
  readonly desktopReleases: DesktopReleases;

  /**
   * The newest GitHub releases, newest first.
   */
  readonly gitHubReleases: readonly GitHubRelease[];
}

/**
 * One stream's answer for one check.
 */
export interface ReleaseStreamStatus {
  /**
   * Where to read what changed. Always a usable URL — it degrades to the changelog index rather than
   * going missing, because a notification without somewhere to read is not worth showing.
   */
  readonly changelogUrl: string;

  /**
   * What is running now, or `null` where the stream does not apply to this platform.
   */
  readonly currentVersion: null | string;

  /**
   * Which stream this is.
   */
  readonly id: ReleaseStreamId;

  /**
   * Whether {@link ReleaseStreamStatus.latestVersion} is strictly newer than
   * {@link ReleaseStreamStatus.currentVersion}. `false` whenever either is unknown — an unknown
   * version is never reported as an update.
   */
  readonly isUpdateAvailable: boolean;

  /**
   * The newest version published on this stream, or `null` when it could not be resolved.
   */
  readonly latestVersion: null | string;
}

/**
 * The Electron version below which Obsidian itself tells a user their installer is too old
 * (`Iie` at `app.js:222745`, compared at `app.js:160712`).
 *
 * Hard-coded rather than read at runtime: it is a constant baked into the app bundle with no API in
 * front of it. Re-check it against `obsidian.asar/app.js` when a new Obsidian version lands.
 */
export const MIN_RECOMMENDED_ELECTRON_VERSION = '28.2.3';

/**
 * How each stream is named wherever the user sees it, so the status bar, the modal and the settings tab
 * cannot drift into calling the same thing three names.
 */
export const RELEASE_STREAM_LABELS: Readonly<Record<ReleaseStreamId, string>> = {
  [ReleaseStreamId.App]: 'App',
  [ReleaseStreamId.Beta]: 'Insider build',
  [ReleaseStreamId.Installer]: 'Installer'
};

/**
 * Whether the bundled Electron is old enough that Obsidian's own diagnostics would recommend
 * reinstalling.
 *
 * ⚠️ Obsidian labels this "installer version too low", but what it actually compares is the ELECTRON
 * version — the installer version is never in the comparison. Reporting it as an installer-version
 * check would be repeating Obsidian's own mislabelling.
 *
 * @param electronVersion - The bundled Electron version, or `null` on mobile.
 * @returns `true` when Electron is below {@link MIN_RECOMMENDED_ELECTRON_VERSION}.
 */
export function checkIsElectronOutdated(electronVersion: null | string): boolean {
  return checkIsOlder(electronVersion, MIN_RECOMMENDED_ELECTRON_VERSION);
}

/**
 * Resolves the public app stream — the `obsidian.asar` bundle that auto-update replaces.
 *
 * ⚠️ `desktop-releases.json` also carries `minimumVersion`. That is the floor auto-update will upgrade
 * FROM, not a version anyone should be on, and it is deliberately not read here.
 *
 * @param feeds - The fetched feeds.
 * @param platform - The platform snapshot.
 * @returns The stream status.
 */
export function resolveAppStreamStatus(feeds: ReleaseFeeds, platform: PlatformSnapshot): ReleaseStreamStatus {
  const latestVersion = platform.isDesktopApp ? feeds.desktopReleases.latestVersion : findLatestAndroidVersion(feeds.gitHubReleases);
  const changelogPlatform = platform.isDesktopApp ? ChangelogPlatform.Desktop : ChangelogPlatform.Mobile;

  return {
    changelogUrl: resolveChangelogUrl(feeds, latestVersion, changelogPlatform, false),
    currentVersion: platform.appVersion,
    id: ReleaseStreamId.App,
    isUpdateAvailable: checkIsOlder(platform.appVersion, latestVersion),
    latestVersion
  };
}

/**
 * Resolves the insider (Catalyst) stream.
 *
 * The current version is the running app version, because a Catalyst build IS the app — the beta
 * channel publishes the same artifact ahead of the public one.
 *
 * @param feeds - The fetched feeds.
 * @param platform - The platform snapshot.
 * @returns The stream status.
 */
export function resolveBetaStreamStatus(feeds: ReleaseFeeds, platform: PlatformSnapshot): ReleaseStreamStatus {
  const latestVersion = feeds.desktopReleases.beta?.latestVersion ?? null;
  const changelogPlatform = platform.isDesktopApp ? ChangelogPlatform.Desktop : ChangelogPlatform.Mobile;

  return {
    changelogUrl: resolveChangelogUrl(feeds, latestVersion, changelogPlatform, true),
    currentVersion: platform.appVersion,
    id: ReleaseStreamId.Beta,
    isUpdateAvailable: checkIsOlder(platform.appVersion, latestVersion),
    latestVersion
  };
}

/**
 * Resolves the installer stream — the executable on disk, which auto-update never touches.
 *
 * @param feeds - The fetched feeds.
 * @param platform - The platform snapshot.
 * @returns The stream status.
 */
export function resolveInstallerStreamStatus(feeds: ReleaseFeeds, platform: PlatformSnapshot): ReleaseStreamStatus {
  const latestVersion = platform.isDesktopApp ? findLatestDesktopInstallerVersion(feeds.gitHubReleases) : null;

  return {
    // The release this version came from was selected BY its desktop assets, so its body is the
    // Desktop changelog rather than a mobile one — which is why the release body is trusted here and
    // Not on the app stream.
    changelogUrl: latestVersion === null
      ? CHANGELOG_INDEX_URL
      : getReleaseChangelogUrl(feeds.gitHubReleases, latestVersion)
        ?? findChangelogUrl(feeds.changelogEntries, latestVersion, ChangelogPlatform.Desktop, false),
    currentVersion: platform.installerVersion,
    id: ReleaseStreamId.Installer,
    isUpdateAvailable: checkIsOlder(platform.installerVersion, latestVersion),
    latestVersion
  };
}

function checkIsOlder(version: null | string, otherVersion: null | string): boolean {
  if (version === null || otherVersion === null || !valid(version) || !valid(otherVersion)) {
    return false;
  }

  return lt(version, otherVersion);
}

function resolveChangelogUrl(
  feeds: ReleaseFeeds,
  version: null | string,
  platform: ChangelogPlatform,
  shouldPreferEarlyAccess: boolean
): string {
  if (version === null) {
    return CHANGELOG_INDEX_URL;
  }

  return findChangelogUrl(feeds.changelogEntries, version, platform, shouldPreferEarlyAccess);
}

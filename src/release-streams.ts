/**
 * @file
 *
 * The three release streams the plugin watches — plus the Electron state, which is not a stream —
 * resolved as pure functions over an already-fetched {@link ReleaseFeeds} and an already-read
 * {@link PlatformSnapshot}. Nothing here fetches or touches `Platform`, so every rule below — which
 * feed answers which stream, and the traps in each — is testable without a network or an app.
 */

import {
  lt,
  valid
} from 'semver';

import type { ObsidianMetadata } from './obsidian-metadata-api.ts';
import type {
  ChangelogEntry,
  DesktopReleases,
  GitHubRelease
} from './obsidian-releases-api.ts';

import {
  getMetadataChangelogUrl,
  getMetadataElectronVersion,
  getMetadataMinRecommendedElectronVersion
} from './obsidian-metadata-api.ts';
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
 * What one check could establish about Electron — what is bundled now, what the newest installer would
 * bundle, and whether the current one is below the floor Obsidian's own diagnostics use.
 */
export interface ElectronStatus {
  /**
   * The Electron the installed installer bundled, or `null` on mobile.
   */
  readonly currentVersion: null | string;

  /**
   * Whether {@link ElectronStatus.currentVersion} is below {@link ElectronStatus.minRecommendedVersion}.
   */
  readonly isOutdated: boolean;

  /**
   * The floor to compare against — from the metadata feed when it records one for the running version,
   * otherwise {@link MIN_RECOMMENDED_ELECTRON_VERSION}.
   */
  readonly minRecommendedVersion: string;

  /**
   * The Electron the NEWEST installer bundles, or `null` when it is not known.
   *
   * ⚠️ `null` for every current Obsidian today: the only source is the metadata feed's
   * `runtimeVersions`, which is absent from every `1.13.x` entry (`T717-P2`). The whole Electron-span
   * half of the UI is therefore dark until that is backfilled, at which point it lights up on its own.
   */
  readonly targetVersion: null | string;
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

  /**
   * Whether Obsidian's own insider (Catalyst) build channel is switched on, or `null` on mobile.
   *
   * ⚠️ Read this ONE-DIRECTIONALLY. Obsidian hides the insider toggle and forces it `false` when there
   * is no license (`app.js:202195-202197`), so `true` IMPLIES a Catalyst license — but `false` is
   * ambiguous: no license, or licensed with the toggle off. There is no supported read of the license
   * itself (it lives on the module-private singleton `Nk` at `app.js:66191`, which escapes to neither
   * `window` nor `app`), so nothing may present `false` as "this user has no Catalyst".
   */
  readonly isInsiderBuild: boolean | null;
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

  /**
   * The ENRICHMENT feed, or `null` when it could not be read.
   *
   * ⚠️ `null` is a normal shape, not an error state, and so is a present feed that has no entry for the
   * version being asked about. Every resolver below must reach the same answer without it as the one it
   * reached before this feed existed — it is only ever consulted FIRST, never instead. See
   * `obsidian-metadata-api.ts` for why: it is a third-party mirror that lags the public feeds.
   */
  readonly metadata: null | ObsidianMetadata;
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
 * @param minRecommendedVersion - The floor to compare against. Defaults to
 * {@link MIN_RECOMMENDED_ELECTRON_VERSION}; the metadata feed supplies a per-version one when it
 * records it.
 * @returns `true` when Electron is below the floor.
 */
export function checkIsElectronOutdated(electronVersion: null | string, minRecommendedVersion: string = MIN_RECOMMENDED_ELECTRON_VERSION): boolean {
  return checkIsOlder(electronVersion, minRecommendedVersion);
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
 * Resolves everything one check could establish about Electron.
 *
 * Kept out of the three stream resolvers on purpose: Electron is not a stream. It moves only when the
 * INSTALLER is replaced, it has no feed of its own that a check reads, and it is reported whether or
 * not the installer stream is being watched — someone who switched that setting off still deserves to
 * be told their Electron is below the floor.
 *
 * @param feeds - The fetched feeds.
 * @param platform - The platform snapshot.
 * @returns The Electron status.
 */
export function resolveElectronStatus(feeds: ReleaseFeeds, platform: PlatformSnapshot): ElectronStatus {
  const latestInstallerVersion = platform.isDesktopApp ? findLatestDesktopInstallerVersion(feeds.gitHubReleases) : null;
  const minRecommendedVersion = getMetadataMinRecommendedElectronVersion(feeds.metadata, platform.appVersion) ?? MIN_RECOMMENDED_ELECTRON_VERSION;

  return {
    currentVersion: platform.electronVersion,
    isOutdated: checkIsElectronOutdated(platform.electronVersion, minRecommendedVersion),
    minRecommendedVersion,
    targetVersion: getMetadataElectronVersion(feeds.metadata, latestInstallerVersion)
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
      : getMetadataChangelogUrl(feeds.metadata, latestVersion, ChangelogPlatform.Desktop, false)
        ?? getReleaseChangelogUrl(feeds.gitHubReleases, latestVersion)
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

  return getMetadataChangelogUrl(feeds.metadata, version, platform, shouldPreferEarlyAccess)
    ?? findChangelogUrl(feeds.changelogEntries, version, platform, shouldPreferEarlyAccess);
}

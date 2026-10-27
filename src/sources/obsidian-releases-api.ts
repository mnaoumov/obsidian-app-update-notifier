/**
 * @file
 *
 * The four public sources this plugin reads Obsidian's release state from, and the parsing each one
 * needs. Nothing here caches: a check fetches once and hands the payloads to the streams, so a cache
 * would only add a way for two streams to disagree about the same check.
 *
 * `requestUrl` rather than `fetch`, because a plugin's `fetch` is subject to CORS and none of these
 * hosts send the headers that would allow it.
 */

import { requestUrl } from 'obsidian';

/**
 * Which build a changelog entry describes.
 */
export enum ChangelogPlatform {
  Desktop = 'Desktop',
  Mobile = 'Mobile'
}

/**
 * One entry of Obsidian's changelog JSON Feed.
 */
export interface ChangelogEntry {
  /**
   * The entry title, in the form `Obsidian <version> <Desktop|Mobile> (<Public|Early access>)` — e.g.
   * `Obsidian 1.13.5 Desktop (Early access)`.
   */
  readonly title: string;

  /**
   * The absolute URL of the changelog page for this entry.
   */
  readonly url: string;
}

/**
 * The JSON Feed envelope around {@link ChangelogEntry}. Only `items` is read; a feed that arrives
 * without it is treated as empty rather than as an error, because a changelog nobody can resolve
 * degrades to the index and never blocks a check.
 */
export interface ChangelogFeed {
  /**
   * The entries, newest first.
   */
  readonly items?: ChangelogEntry[];
}

/**
 * The subset of `desktop-releases.json` this plugin reads.
 */
export interface DesktopReleases {
  /**
   * The insider (Catalyst) channel. Present in every response observed, but the plugin treats it as
   * optional rather than assuming a shape it does not control.
   */
  readonly beta?: DesktopReleasesChannel;

  /**
   * The newest app version on the public channel.
   */
  readonly latestVersion: string;

  /**
   * ⚠️ The OLDEST app version Obsidian's own auto-update will upgrade FROM — the hard floor, not a
   * recommendation. Read it if you must, but never present it to a user as a version they should be on.
   */
  readonly minimumVersion: string;
}

/**
 * One release channel inside `desktop-releases.json`.
 */
export interface DesktopReleasesChannel {
  /**
   * The newest app version on this channel.
   */
  readonly latestVersion: string;

  /**
   * The auto-update floor for this channel. See {@link DesktopReleases.minimumVersion}.
   */
  readonly minimumVersion: string;
}

/**
 * The subset of a GitHub release this plugin reads.
 */
export interface GitHubRelease {
  /**
   * The files published with the release. Which extensions appear here is the ONLY reliable signal of
   * what the release actually shipped for.
   */
  readonly assets: readonly GitHubReleaseAsset[];

  /**
   * The release notes. For `obsidianmd/obsidian-releases` this is literally the changelog URL and
   * nothing else.
   */
  readonly body: string;

  /**
   * The tag, in the form `v1.13.7`.
   */
  readonly tag_name: string;
}

/**
 * One file published with a GitHub release.
 */
export interface GitHubReleaseAsset {
  /**
   * The file name, e.g. `Obsidian-1.13.7.exe`.
   */
  readonly name: string;
}

/**
 * The changelog index, used when a version has no changelog URL to read from a release.
 */
export const CHANGELOG_INDEX_URL = 'https://obsidian.md/changelog/';

/**
 * Obsidian's changelog as a JSON Feed.
 *
 * Preferred over scraping {@link CHANGELOG_INDEX_URL}: it is structured, and it carries the FULL
 * history (484 entries as of 2026-08-29) rather than the ~21 the HTML index renders — which matters
 * because a Catalyst-only version has no GitHub release to read a changelog URL from, and can be far
 * enough back that the HTML index no longer lists it.
 */
export const CHANGELOG_JSON_URL = 'https://obsidian.md/changelog.json';

/**
 * The same file Obsidian's own updater reads for the app and beta streams.
 */
export const DESKTOP_RELEASES_JSON_URL = 'https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/desktop-releases.json';

/**
 * Obsidian's releases, newest first. Ten is comfortably more than the run of consecutive mobile-only
 * releases that has ever separated two desktop ones, while keeping the response small.
 */
export const GITHUB_RELEASES_URL = 'https://api.github.com/repos/obsidianmd/obsidian-releases/releases?per_page=10';

/**
 * The Android app is published as the release's only asset on a mobile-only release.
 */
const ANDROID_ASSET_EXTENSION = '.apk';

/**
 * The extensions that mark a release as having shipped a DESKTOP INSTALLER.
 *
 * ⚠️ `obsidian-<version>.asar.gz` is the APP payload — what auto-update downloads — and is present on
 * releases that ship no installer at all. It ends in `.gz`, so a substring or `.gz` test silently
 * counts it as an installer; only these exact endings do not. Lower-cased, and compared against a
 * lower-cased file name, because the published names mix cases (`Obsidian-1.13.7.AppImage`,
 * `obsidian_1.13.7_amd64.deb`).
 */
const DESKTOP_INSTALLER_ASSET_EXTENSIONS: readonly string[] = ['.appimage', '.deb', '.dmg', '.exe', '.tar.gz'];

/**
 * Fetches Obsidian's changelog JSON Feed.
 *
 * @returns A {@link Promise} resolving to the feed's entries, newest first.
 */
export async function fetchChangelogEntries(): Promise<ChangelogEntry[]> {
  const response = await requestUrl(CHANGELOG_JSON_URL);
  const feed = response.json as ChangelogFeed;
  return feed.items ?? [];
}

/**
 * Fetches `desktop-releases.json`.
 *
 * @returns A {@link Promise} resolving to the app and beta channel state.
 */
export async function fetchDesktopReleases(): Promise<DesktopReleases> {
  const response = await requestUrl(DESKTOP_RELEASES_JSON_URL);
  return response.json as DesktopReleases;
}

/**
 * Fetches the newest GitHub releases of `obsidianmd/obsidian-releases`.
 *
 * @returns A {@link Promise} resolving to the releases, newest first.
 */
export async function fetchGitHubReleases(): Promise<GitHubRelease[]> {
  const response = await requestUrl(GITHUB_RELEASES_URL);
  return response.json as GitHubRelease[];
}

/**
 * Resolves the changelog URL for a version from the changelog feed.
 *
 * A version can have several entries — desktop and mobile, and an early-access one days before the
 * public one — so the match is narrowed by platform and then by channel. A Catalyst-only version has
 * ONLY an early-access entry, which is why `shouldPreferEarlyAccess` is a preference and not a filter:
 * preferring the public entry must still fall back to the early-access one rather than find nothing.
 *
 * @param entries - The changelog entries, as returned by {@link fetchChangelogEntries}.
 * @param version - The bare version, e.g. `1.13.7`.
 * @param platform - Which build's changelog to look for.
 * @param shouldPreferEarlyAccess - Whether to prefer the early-access (Catalyst) entry over the public one.
 * @returns The changelog URL, or {@link CHANGELOG_INDEX_URL} when the version is not in the feed.
 */
export function findChangelogUrl(
  entries: readonly ChangelogEntry[],
  version: string,
  platform: ChangelogPlatform,
  shouldPreferEarlyAccess: boolean
): string {
  const candidates = entries.filter((entry) => entry.title.includes(` ${version} `) && entry.title.includes(` ${platform} `));
  const preferred = candidates.find((entry) => entry.title.includes('(Early access)') === shouldPreferEarlyAccess);
  const [firstCandidate] = candidates;
  return (preferred ?? firstCandidate)?.url ?? CHANGELOG_INDEX_URL;
}

/**
 * Finds the newest version that shipped the Android app.
 *
 * @param releases - The releases, newest first, as returned by {@link fetchGitHubReleases}.
 * @returns The bare version, or `null` when none of the releases shipped one.
 */
export function findLatestAndroidVersion(releases: readonly GitHubRelease[]): null | string {
  const release = releases.find((candidate) => candidate.assets.some((asset) => asset.name.toLowerCase().endsWith(ANDROID_ASSET_EXTENSION)));
  return release ? toBareVersion(release.tag_name) : null;
}

/**
 * Finds the newest version that shipped a desktop installer.
 *
 * ⚠️ NOT the newest release. A release can be mobile-only — v1.13.8 published `Obsidian-1.13.8.apk` and
 * nothing else, while the newest desktop installer was still v1.13.7 — so taking the first release
 * would report an installer that does not exist for desktop.
 *
 * @param releases - The releases, newest first, as returned by {@link fetchGitHubReleases}.
 * @returns The bare version, or `null` when none of the releases shipped one.
 */
export function findLatestDesktopInstallerVersion(releases: readonly GitHubRelease[]): null | string {
  const release = findLatestDesktopInstallerRelease(releases);
  return release ? toBareVersion(release.tag_name) : null;
}

/**
 * Reads the changelog URL a release publishes as its entire body.
 *
 * @param releases - The releases, newest first, as returned by {@link fetchGitHubReleases}.
 * @param version - The bare version whose release to read.
 * @returns The changelog URL, or `null` when the release is absent or its body is not one.
 */
export function getReleaseChangelogUrl(releases: readonly GitHubRelease[], version: string): null | string {
  const release = releases.find((candidate) => toBareVersion(candidate.tag_name) === version);
  const body = release?.body.trim() ?? '';
  return body.startsWith(CHANGELOG_INDEX_URL) ? body : null;
}

function checkIsDesktopInstallerAsset(assetName: string): boolean {
  const lowerCasedAssetName = assetName.toLowerCase();
  return DESKTOP_INSTALLER_ASSET_EXTENSIONS.some((extension) => lowerCasedAssetName.endsWith(extension));
}

function findLatestDesktopInstallerRelease(releases: readonly GitHubRelease[]): GitHubRelease | null {
  return releases.find((release) => release.assets.some((asset) => checkIsDesktopInstallerAsset(asset.name))) ?? null;
}

function toBareVersion(tagName: string): string {
  return tagName.startsWith('v') ? tagName.slice(1) : tagName;
}

/**
 * @file
 *
 * Electron's own release index, used only to enumerate the releases BETWEEN the Electron a user has
 * and the one the latest installer would give them.
 *
 * ⚠️ This feed is **1.28 MB** (3375 entries, 1160 of them stable, measured 2026-08-30), which is why
 * nothing here is called from the hourly check. It is fetched lazily, once, when the details modal is
 * opened and both Electron versions are actually known — a megabyte an hour to render a list nobody
 * asked to see is not a trade worth making.
 */

import { requestUrl } from 'obsidian';

/**
 * One entry of Electron's release index. Only `version` is read; each entry also carries `date`,
 * `node`, `v8`, `chrome`, `modules` and the published `files`.
 */
export interface ElectronRelease {
  /**
   * The version, e.g. `39.8.3` — or `46.0.0-nightly.20260828` for a pre-release.
   */
  readonly version: string;
}

/**
 * Electron's full release index, newest first.
 */
export const ELECTRON_RELEASES_URL = 'https://releases.electronjs.org/releases.json';

/**
 * The prefix of a single release's page, which takes a `v`-prefixed version.
 */
const ELECTRON_RELEASE_URL_PREFIX = 'https://releases.electronjs.org/release/v';

/**
 * Fetches every STABLE Electron version, oldest first.
 *
 * Pre-releases are dropped: the index is mostly `-nightly` / `-alpha` / `-beta` entries (2215 of the
 * 3375), none of which an Obsidian installer ever bundles, and listing them as versions someone
 * "passed through" would be wrong as well as unreadable.
 *
 * ⚠️ Sorting is deliberately NOT done here — the caller compares with `semver`, and this returns the
 * feed's own order so a caller that only needs membership pays nothing for ordering.
 *
 * @returns A {@link Promise} resolving to the bare stable versions, in the feed's order (newest first).
 */
export async function fetchElectronStableVersions(): Promise<string[]> {
  const response = await requestUrl(ELECTRON_RELEASES_URL);
  const releases = response.json as ElectronRelease[];
  return releases.map((release) => release.version).filter((version) => !version.includes('-'));
}

/**
 * Builds the URL of one Electron release's page.
 *
 * @param version - The bare version, e.g. `39.8.3`.
 * @returns The release page URL.
 */
export function getElectronReleaseUrl(version: string): string {
  return `${ELECTRON_RELEASE_URL_PREFIX}${version}`;
}

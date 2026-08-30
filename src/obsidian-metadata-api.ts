/**
 * @file
 *
 * The one ENRICHMENT feed — `obsidian-integration-testing`'s `metadata.json`, a per-version index of
 * things Obsidian itself publishes nowhere machine-readable: which Electron an installer bundles, and
 * the changelog URL of each of the four targets.
 *
 * ⚠️ Deliberately kept out of `obsidian-releases-api.ts`. Every source in that module is Obsidian's own
 * and is FATAL on failure — a check that cannot read them found nothing and says so. This one is a
 * third-party mirror whose failure must be SWALLOWED, and whose absence for a given version is the
 * normal path rather than an error. Mixing the two failure contracts in one module is how the
 * distinction gets quietly lost.
 *
 * Two properties follow from it being a mirror, and both are why nothing here ever decides an answer
 * the public feeds already give:
 *
 * - **It lags.** On 2026-08-30 GitHub's newest release was `v1.13.8` while this file's newest entry was
 *   `1.13.7`, so it was already a version behind for the Android app stream.
 * - **It is sparse.** `runtimeVersions` is present on 103 of 325 entries and on NO `1.13.x` entry at
 *   all, so the Electron half of the update notice is dark until `T717-P2` backfills it.
 */

import { requestUrl } from 'obsidian';

import { ChangelogPlatform } from './obsidian-releases-api.ts';

/**
 * The whole file — one entry per Obsidian version, keyed by the bare version.
 *
 * The value is optional rather than required because an index signature that promises a value for
 * every string is a lie that makes every lookup below look total when none of them is.
 */
export type ObsidianMetadata = Readonly<Record<string, ObsidianVersionMetadata | undefined>>;

/**
 * The changelog URL of each publishing target, as `T679-P2` reshaped it from the single string it used
 * to be. Every key is optional — a version with no mobile build carries no `mobile*` key.
 */
export interface ObsidianVersionChangelogUrls {
  /**
   * The public desktop changelog.
   */
  readonly desktop?: string;

  /**
   * The Catalyst (early access) desktop changelog, published days BEFORE the public one.
   */
  readonly desktopCatalyst?: string;

  /**
   * The public mobile changelog.
   */
  readonly mobile?: string;

  /**
   * The Catalyst (early access) mobile changelog.
   */
  readonly mobileCatalyst?: string;
}

/**
 * One version's entry. Only the keys this plugin reads are declared; the file also carries `available`,
 * `channel`, `downloads`, `ecmaScriptVersion`, `minRecommendedInstallerVersion` and
 * `minRunnableInstallerVersion`, which it does not.
 *
 * Every key is optional because every key genuinely is: the coverage differs per version and per key.
 */
export interface ObsidianVersionMetadata {
  /**
   * Where to read what changed, per target.
   */
  readonly changelogUrl?: ObsidianVersionChangelogUrls;

  /**
   * The Electron floor Obsidian's own diagnostics compare against, when this version records one.
   */
  readonly minRecommendedElectronVersion?: string;

  /**
   * What the installer for this version bundles.
   */
  readonly runtimeVersions?: ObsidianVersionRuntimeVersions;
}

/**
 * The versions an installer bundles. Only `electron` is read; the entry also carries `node`, `v8`,
 * `chrome` and two dozen more.
 */
export interface ObsidianVersionRuntimeVersions {
  /**
   * The bundled Electron version, e.g. `39.8.3`.
   */
  readonly electron?: string;
}

/**
 * The published `metadata.json`.
 *
 * Served from `main` of a public repository, which is what makes it usable as a runtime feed at all —
 * `obsidian-versions` (`P20`) is not public, which is why `T647-P41` rejected it as a source.
 */
export const OBSIDIAN_METADATA_URL = 'https://raw.githubusercontent.com/mnaoumov/obsidian-integration-testing/main/metadata.json';

/**
 * Fetches the metadata index.
 *
 * ⚠️ Throws like any other fetch. The CALLER is responsible for swallowing that — see
 * `update-checker-component.ts`, where this one feed is allowed to fail without failing the check.
 *
 * `requestUrl` rather than `fetch`, for the same reason as the other feeds: a plugin's `fetch` is
 * subject to CORS and this host sends no header that would allow it.
 *
 * @returns A {@link Promise} resolving to the metadata index.
 */
export async function fetchObsidianMetadata(): Promise<ObsidianMetadata> {
  const response = await requestUrl(OBSIDIAN_METADATA_URL);
  return response.json as ObsidianMetadata;
}

/**
 * Reads a version's changelog URL for one target.
 *
 * `shouldPreferEarlyAccess` is a PREFERENCE, not a filter — exactly as in `findChangelogUrl`, which
 * this mirrors. A Catalyst-only version has only a `*Catalyst` key, and asking for the public one must
 * still find it rather than find nothing.
 *
 * @param metadata - The metadata index, or `null` when the feed could not be read.
 * @param version - The bare version, e.g. `1.13.7`.
 * @param platform - Which build's changelog to read.
 * @param shouldPreferEarlyAccess - Whether to prefer the Catalyst entry over the public one.
 * @returns The changelog URL, or `null` when the feed, the version, or both keys are absent.
 */
export function getMetadataChangelogUrl(
  metadata: null | ObsidianMetadata,
  version: string,
  platform: ChangelogPlatform,
  shouldPreferEarlyAccess: boolean
): null | string {
  const changelogUrls = metadata?.[version]?.changelogUrl;
  if (!changelogUrls) {
    return null;
  }

  const isDesktop = platform === ChangelogPlatform.Desktop;
  const publicUrl = isDesktop ? changelogUrls.desktop : changelogUrls.mobile;
  const catalystUrl = isDesktop ? changelogUrls.desktopCatalyst : changelogUrls.mobileCatalyst;
  const [preferredUrl, fallbackUrl] = shouldPreferEarlyAccess ? [catalystUrl, publicUrl] : [publicUrl, catalystUrl];

  return preferredUrl ?? fallbackUrl ?? null;
}

/**
 * Reads the Electron version the installer for a version bundles.
 *
 * ⚠️ Returns `null` for every `1.13.x` today — `runtimeVersions` has stopped being populated
 * (`T717-P2`). That is a data gap, not a failure, and the caller renders nothing rather than guessing.
 *
 * @param metadata - The metadata index, or `null` when the feed could not be read.
 * @param version - The bare INSTALLER version, e.g. `1.13.7`.
 * @returns The bundled Electron version, or `null` when it is not recorded.
 */
export function getMetadataElectronVersion(metadata: null | ObsidianMetadata, version: null | string): null | string {
  if (version === null) {
    return null;
  }

  return metadata?.[version]?.runtimeVersions?.electron ?? null;
}

/**
 * Reads the Electron floor a version records.
 *
 * @param metadata - The metadata index, or `null` when the feed could not be read.
 * @param version - The bare version, e.g. `1.13.7`.
 * @returns The recorded floor, or `null` when this version does not record one.
 */
export function getMetadataMinRecommendedElectronVersion(metadata: null | ObsidianMetadata, version: null | string): null | string {
  if (version === null) {
    return null;
  }

  return metadata?.[version]?.minRecommendedElectronVersion ?? null;
}

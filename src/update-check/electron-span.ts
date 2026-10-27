/**
 * @file
 *
 * The Electron releases between what a user has and what the latest installer would give them,
 * resolved as a pure function over an already-fetched version list so the bounding rule below is
 * testable without a network.
 */

import {
  compare,
  gt,
  lte,
  major,
  valid
} from 'semver';

/**
 * The span between two Electron versions.
 */
export interface ElectronSpan {
  /**
   * The versions to link, oldest first. Empty when either endpoint is unknown, or when the user is
   * already on the target.
   */
  readonly listedVersions: readonly string[];

  /**
   * How many versions in the span are NOT in {@link ElectronSpan.listedVersions}.
   *
   * Rendered rather than swallowed: a 245-release span silently becoming 12 links reads as "that is all
   * of them", which is exactly the silent truncation the no-silent-caps discipline forbids.
   */
  readonly omittedCount: number;
}

/**
 * Above this many releases the span is collapsed to one per major rather than listed in full.
 *
 * The number is chosen from the real distribution: someone reasonably current spans a handful (6
 * releases for `39.6.0 → 39.8.3`), while someone on an old installer — the very user this plugin
 * exists for, with automatic updates off — spans 245 (`28.2.3 → 39.8.3`). 20 lists the first case
 * whole and refuses to render the second as a wall.
 */
export const MAX_LISTED_ELECTRON_RELEASES = 20;

/**
 * Resolves which Electron releases sit between the running version and the target.
 *
 * Never throws and never reports a span it is not sure of: an unknown or unparseable endpoint yields an
 * empty span, because "we cannot tell" must not render as "there is nothing in between".
 *
 * @param currentVersion - The Electron the installed installer bundles, or `null` when unknown.
 * @param targetVersion - The Electron the latest installer bundles, or `null` when unknown.
 * @param stableVersions - Every stable Electron version, in any order.
 * @returns The span.
 */
export function resolveElectronSpan(currentVersion: null | string, targetVersion: null | string, stableVersions: readonly string[]): ElectronSpan {
  if (currentVersion === null || targetVersion === null || !valid(currentVersion) || !valid(targetVersion)) {
    return EMPTY_SPAN;
  }

  const spanVersions = stableVersions
    .filter((version) => valid(version) !== null && gt(version, currentVersion) && lte(version, targetVersion))
    .sort(compare);

  if (spanVersions.length <= MAX_LISTED_ELECTRON_RELEASES) {
    return {
      listedVersions: spanVersions,
      omittedCount: 0
    };
  }

  const listedVersions = collapseToNewestPerMajor(spanVersions);

  return {
    listedVersions,
    omittedCount: spanVersions.length - listedVersions.length
  };
}

const EMPTY_SPAN: ElectronSpan = {
  listedVersions: [],
  omittedCount: 0
};

/**
 * Keeps the newest release of each major.
 *
 * The newest rather than the first, because the newest of a major is the one that major ended on — the
 * state someone crossing it actually passed through — and because it keeps the span's own endpoint,
 * which is by definition the newest of the last major present.
 *
 * @param spanVersions - The span's versions, ascending.
 * @returns One version per major, ascending.
 */
function collapseToNewestPerMajor(spanVersions: readonly string[]): string[] {
  const newestByMajor = new Map<number, string>();

  for (const version of spanVersions) {
    newestByMajor.set(major(version), version);
  }

  return [...newestByMajor.values()];
}

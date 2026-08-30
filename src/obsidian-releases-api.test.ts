import type { RequestUrlResponse } from 'obsidian';

import { requestUrl } from 'obsidian';
import { castTo } from 'obsidian-dev-utils/object-utils';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type {
  ChangelogEntry,
  GitHubRelease
} from './obsidian-releases-api.ts';

import {
  CHANGELOG_INDEX_URL,
  CHANGELOG_JSON_URL,
  ChangelogPlatform,
  DESKTOP_RELEASES_JSON_URL,
  fetchChangelogEntries,
  fetchDesktopReleases,
  fetchGitHubReleases,
  findChangelogUrl,
  findLatestAndroidVersion,
  findLatestDesktopInstallerVersion,
  getReleaseChangelogUrl,
  GITHUB_RELEASES_URL
} from './obsidian-releases-api.ts';

vi.mock('obsidian', async (importOriginal) => ({
  ...await importOriginal<typeof import('obsidian')>(),
  requestUrl: vi.fn()
}));

const mockedRequestUrl = vi.mocked(requestUrl);

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * The real shape of the two newest releases on 2026-08-29: v1.13.8 shipped ONLY the Android app, while
 * the newest desktop installer was still v1.13.7. Every installer-stream test leans on this.
 */
const RELEASES: readonly GitHubRelease[] = [
  createRelease('v1.13.8', ['Obsidian-1.13.8.apk'], 'https://obsidian.md/changelog/2026-08-20-mobile-v1.13.8/'),
  createRelease(
    'v1.13.7',
    [
      'Obsidian-1.13.7-arm64.AppImage',
      'obsidian-1.13.7-arm64.tar.gz',
      'Obsidian-1.13.7.apk',
      'Obsidian-1.13.7.AppImage',
      'obsidian-1.13.7.asar.gz',
      'Obsidian-1.13.7.dmg',
      'Obsidian-1.13.7.exe',
      'obsidian-1.13.7.tar.gz',
      'obsidian_1.13.7_amd64.deb'
    ],
    'https://obsidian.md/changelog/2026-08-12-desktop-v1.13.7/'
  )
];

const CHANGELOG_ENTRIES: readonly ChangelogEntry[] = [
  createChangelogEntry('Obsidian 1.13.8 Mobile (Public)', 'https://obsidian.md/changelog/2026-08-20-mobile-v1.13.8/'),
  createChangelogEntry('Obsidian 1.13.7 Desktop (Public)', 'https://obsidian.md/changelog/2026-08-12-desktop-v1.13.7/'),
  createChangelogEntry('Obsidian 1.13.7 Desktop (Early access)', 'https://obsidian.md/changelog/2026-08-11-desktop-v1.13.7/'),
  createChangelogEntry('Obsidian 1.13.5 Desktop (Early access)', 'https://obsidian.md/changelog/2026-08-05-desktop-v1.13.5/')
];

describe('findLatestDesktopInstallerVersion', () => {
  it('should skip a mobile-only newest release rather than report an installer that does not exist', () => {
    expect(findLatestDesktopInstallerVersion(RELEASES)).toBe('1.13.7');
  });

  it('should not count the app payload as an installer', () => {
    // `obsidian-<version>.asar.gz` is what auto-update downloads. It ends in `.gz`, so a looser test
    // Would report an installer for a release that shipped none.
    const releases = [createRelease('v1.13.9', ['obsidian-1.13.9.asar.gz'])];
    expect(findLatestDesktopInstallerVersion(releases)).toBeNull();
  });

  it.each([
    ['Obsidian-1.14.0.exe'],
    ['Obsidian-1.14.0.dmg'],
    ['Obsidian-1.14.0.AppImage'],
    ['obsidian_1.14.0_amd64.deb'],
    ['obsidian-1.14.0.tar.gz']
  ])('should recognize %s as a desktop installer', (assetName: string) => {
    expect(findLatestDesktopInstallerVersion([createRelease('v1.14.0', [assetName])])).toBe('1.14.0');
  });

  it('should accept a tag published without the leading v', () => {
    expect(findLatestDesktopInstallerVersion([createRelease('1.14.0', ['Obsidian-1.14.0.exe'])])).toBe('1.14.0');
  });

  it('should return null when no release shipped a desktop installer', () => {
    expect(findLatestDesktopInstallerVersion([])).toBeNull();
  });
});

describe('findLatestAndroidVersion', () => {
  it('should take the mobile-only newest release', () => {
    expect(findLatestAndroidVersion(RELEASES)).toBe('1.13.8');
  });

  it('should return null when no release shipped the Android app', () => {
    expect(findLatestAndroidVersion([createRelease('v1.14.0', ['Obsidian-1.14.0.exe'])])).toBeNull();
  });
});

describe('getReleaseChangelogUrl', () => {
  it('should read the changelog URL a release publishes as its whole body', () => {
    expect(getReleaseChangelogUrl(RELEASES, '1.13.7')).toBe('https://obsidian.md/changelog/2026-08-12-desktop-v1.13.7/');
  });

  it('should return null for a version with no release', () => {
    expect(getReleaseChangelogUrl(RELEASES, '1.13.5')).toBeNull();
  });

  it('should return null when the body is not a changelog URL', () => {
    const releases = [createRelease('v1.14.0', ['Obsidian-1.14.0.exe'], 'Some release notes.')];
    expect(getReleaseChangelogUrl(releases, '1.14.0')).toBeNull();
  });
});

describe('findChangelogUrl', () => {
  it('should prefer the public entry over the early-access one', () => {
    expect(findChangelogUrl(CHANGELOG_ENTRIES, '1.13.7', ChangelogPlatform.Desktop, false))
      .toBe('https://obsidian.md/changelog/2026-08-12-desktop-v1.13.7/');
  });

  it('should prefer the early-access entry when asked for it', () => {
    expect(findChangelogUrl(CHANGELOG_ENTRIES, '1.13.7', ChangelogPlatform.Desktop, true))
      .toBe('https://obsidian.md/changelog/2026-08-11-desktop-v1.13.7/');
  });

  it('should fall back to the early-access entry for a Catalyst-only version', () => {
    // 1.13.5 never shipped publicly, so it has no GitHub release and no public changelog entry.
    // Preferring the public one must still find the early-access one rather than nothing.
    expect(findChangelogUrl(CHANGELOG_ENTRIES, '1.13.5', ChangelogPlatform.Desktop, false))
      .toBe('https://obsidian.md/changelog/2026-08-05-desktop-v1.13.5/');
  });

  it('should narrow by platform', () => {
    expect(findChangelogUrl(CHANGELOG_ENTRIES, '1.13.8', ChangelogPlatform.Mobile, false))
      .toBe('https://obsidian.md/changelog/2026-08-20-mobile-v1.13.8/');
    expect(findChangelogUrl(CHANGELOG_ENTRIES, '1.13.8', ChangelogPlatform.Desktop, false)).toBe(CHANGELOG_INDEX_URL);
  });

  it('should fall back to the changelog index for a version the feed does not carry', () => {
    expect(findChangelogUrl(CHANGELOG_ENTRIES, '9.9.9', ChangelogPlatform.Desktop, false)).toBe(CHANGELOG_INDEX_URL);
  });
});

describe('fetchChangelogEntries', () => {
  it('should read the feed items', async () => {
    mockedRequestUrl.mockResolvedValue(createResponse({ items: CHANGELOG_ENTRIES }));
    await expect(fetchChangelogEntries()).resolves.toEqual(CHANGELOG_ENTRIES);
    expect(mockedRequestUrl).toHaveBeenCalledWith(CHANGELOG_JSON_URL);
  });

  it('should treat a feed with no items as empty rather than as an error', () => {
    // A changelog nobody can resolve degrades to the index; it must never take a whole check down with it.
    mockedRequestUrl.mockResolvedValue(createResponse({}));
    return expect(fetchChangelogEntries()).resolves.toEqual([]);
  });
});

describe('fetchDesktopReleases', () => {
  it('should read the same file Obsidian\'s own updater reads', async () => {
    const desktopReleases = {
      latestVersion: '1.13.7',
      minimumVersion: '1.1.9'
    };
    mockedRequestUrl.mockResolvedValue(createResponse(desktopReleases));
    await expect(fetchDesktopReleases()).resolves.toEqual(desktopReleases);
    expect(mockedRequestUrl).toHaveBeenCalledWith(DESKTOP_RELEASES_JSON_URL);
  });
});

describe('fetchGitHubReleases', () => {
  it('should read the releases newest first', async () => {
    mockedRequestUrl.mockResolvedValue(createResponse(RELEASES));
    await expect(fetchGitHubReleases()).resolves.toEqual(RELEASES);
    expect(mockedRequestUrl).toHaveBeenCalledWith(GITHUB_RELEASES_URL);
  });
});

function createChangelogEntry(title: string, url: string): ChangelogEntry {
  return { title, url };
}

function createRelease(tagName: string, assetNames: readonly string[], body = ''): GitHubRelease {
  return {
    assets: assetNames.map((name) => ({ name })),
    body,
    /* eslint-disable-next-line camelcase -- GitHub publishes the tag as `tag_name`; a fixture that renamed it would stop matching the payload it stands in for. */
    tag_name: tagName
  };
}

function createResponse(json: unknown): RequestUrlResponse {
  return castTo<RequestUrlResponse>({ json });
}

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

import type { ObsidianMetadata } from './obsidian-metadata-api.ts';

import {
  fetchObsidianMetadata,
  getMetadataChangelogUrl,
  getMetadataElectronVersion,
  getMetadataMinRecommendedElectronVersion,
  OBSIDIAN_METADATA_URL
} from './obsidian-metadata-api.ts';
import { ChangelogPlatform } from './obsidian-releases-api.ts';

vi.mock('obsidian', async (importOriginal) => ({
  ...await importOriginal<typeof import('obsidian')>(),
  requestUrl: vi.fn()
}));

const mockedRequestUrl = vi.mocked(requestUrl);

beforeEach(() => {
  vi.clearAllMocks();
});

const DESKTOP_URL = 'https://obsidian.md/changelog/2026-08-12-desktop-v1.13.7/';
const DESKTOP_CATALYST_URL = 'https://obsidian.md/changelog/2026-08-11-desktop-v1.13.7/';
const MOBILE_URL = 'https://obsidian.md/changelog/2026-08-12-mobile-v1.13.7/';
const MOBILE_CATALYST_URL = 'https://obsidian.md/changelog/2026-08-11-mobile-v1.13.7/';

/**
 * The real `1.13.7` entry as published on 2026-08-30, plus a `1.12.7` entry carrying the
 * `runtimeVersions` that 1.13.7 conspicuously lacks — which is the whole of `T717-P2`.
 */
const METADATA: ObsidianMetadata = {
  '1.12.7': {
    minRecommendedElectronVersion: '30.1.2',
    runtimeVersions: { electron: '39.8.3' }
  },
  '1.13.7': {
    changelogUrl: {
      desktop: DESKTOP_URL,
      desktopCatalyst: DESKTOP_CATALYST_URL,
      mobile: MOBILE_URL,
      mobileCatalyst: MOBILE_CATALYST_URL
    }
  }
};

describe('fetchObsidianMetadata', () => {
  it('should read the published index', async () => {
    mockedRequestUrl.mockResolvedValue(castTo<RequestUrlResponse>({ json: METADATA }));

    expect(await fetchObsidianMetadata()).toEqual(METADATA);
    expect(mockedRequestUrl).toHaveBeenCalledWith(OBSIDIAN_METADATA_URL);
  });

  it('should let a failure through, because swallowing it is the caller\'s job and only the caller knows it is optional', async () => {
    mockedRequestUrl.mockRejectedValue(new Error('offline'));
    await expect(fetchObsidianMetadata()).rejects.toThrow('offline');
  });
});

describe('getMetadataChangelogUrl', () => {
  it.each([
    ['the public desktop page', ChangelogPlatform.Desktop, false, DESKTOP_URL],
    ['the Catalyst desktop page', ChangelogPlatform.Desktop, true, DESKTOP_CATALYST_URL],
    ['the public mobile page', ChangelogPlatform.Mobile, false, MOBILE_URL],
    ['the Catalyst mobile page', ChangelogPlatform.Mobile, true, MOBILE_CATALYST_URL]
  ])('should resolve %s', (_description, platform, shouldPreferEarlyAccess, expectedUrl) => {
    expect(getMetadataChangelogUrl(METADATA, '1.13.7', platform, shouldPreferEarlyAccess)).toBe(expectedUrl);
  });

  it('should treat early access as a preference, not a filter, so a Catalyst-only version is still found', () => {
    const catalystOnly: ObsidianMetadata = { '1.13.9': { changelogUrl: { desktopCatalyst: DESKTOP_CATALYST_URL } } };
    expect(getMetadataChangelogUrl(catalystOnly, '1.13.9', ChangelogPlatform.Desktop, false)).toBe(DESKTOP_CATALYST_URL);
  });

  it('should fall the other way too, so asking for Catalyst still finds a public-only entry', () => {
    const publicOnly: ObsidianMetadata = { '1.13.9': { changelogUrl: { desktop: DESKTOP_URL } } };
    expect(getMetadataChangelogUrl(publicOnly, '1.13.9', ChangelogPlatform.Desktop, true)).toBe(DESKTOP_URL);
  });

  it('should not cross platforms — a desktop-only entry answers nothing for mobile', () => {
    const desktopOnly: ObsidianMetadata = { '1.13.9': { changelogUrl: { desktop: DESKTOP_URL } } };
    expect(getMetadataChangelogUrl(desktopOnly, '1.13.9', ChangelogPlatform.Mobile, false)).toBeNull();
  });

  it.each([
    ['the feed could not be read', null, '1.13.7'],
    // The lag: on 2026-08-30 GitHub had v1.13.8 while the feed's newest entry was 1.13.7.
    ['the feed has no entry for the version', METADATA, '1.13.8'],
    ['the entry records no changelog at all', METADATA, '1.12.7']
  ])('should answer nothing when %s', (_description, metadata, version) => {
    expect(getMetadataChangelogUrl(metadata, version, ChangelogPlatform.Desktop, false)).toBeNull();
  });
});

describe('getMetadataElectronVersion', () => {
  it('should read what the installer bundles when the entry records it', () => {
    expect(getMetadataElectronVersion(METADATA, '1.12.7')).toBe('39.8.3');
  });

  it.each([
    ['the version is unknown', METADATA, null],
    ['the feed could not be read', null, '1.12.7'],
    ['the feed has no entry for the version', METADATA, '1.13.8'],
    // The production case today: no 1.13.x entry carries `runtimeVersions` at all (`T717-P2`).
    ['the entry records no runtime versions', METADATA, '1.13.7']
  ])('should answer nothing when %s', (_description, metadata, version) => {
    expect(getMetadataElectronVersion(metadata, version)).toBeNull();
  });
});

describe('getMetadataMinRecommendedElectronVersion', () => {
  it('should read the floor when the entry records one', () => {
    expect(getMetadataMinRecommendedElectronVersion(METADATA, '1.12.7')).toBe('30.1.2');
  });

  it.each([
    ['the version is unknown', METADATA, null],
    ['the feed could not be read', null, '1.12.7'],
    ['the entry records no floor', METADATA, '1.13.7']
  ])('should answer nothing when %s', (_description, metadata, version) => {
    expect(getMetadataMinRecommendedElectronVersion(metadata, version)).toBeNull();
  });
});

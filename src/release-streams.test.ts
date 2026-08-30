import {
  describe,
  expect,
  it
} from 'vitest';

import type { ObsidianMetadata } from './obsidian-metadata-api.ts';
import type {
  PlatformSnapshot,
  ReleaseFeeds
} from './release-streams.ts';

import { CHANGELOG_INDEX_URL } from './obsidian-releases-api.ts';
import {
  checkIsElectronOutdated,
  MIN_RECOMMENDED_ELECTRON_VERSION,
  ReleaseStreamId,
  resolveAppStreamStatus,
  resolveBetaStreamStatus,
  resolveElectronStatus,
  resolveInstallerStreamStatus
} from './release-streams.ts';

const DESKTOP_CHANGELOG_URL = 'https://obsidian.md/changelog/2026-08-12-desktop-v1.13.7/';
const DESKTOP_EARLY_ACCESS_CHANGELOG_URL = 'https://obsidian.md/changelog/2026-08-11-desktop-v1.13.7/';
const MOBILE_CHANGELOG_URL = 'https://obsidian.md/changelog/2026-08-20-mobile-v1.13.8/';

/**
 * The real state of all three feeds on 2026-08-29, so every expectation below is one a real check
 * would have produced.
 */
const FEEDS: ReleaseFeeds = {
  changelogEntries: [
    { title: 'Obsidian 1.13.8 Mobile (Public)', url: MOBILE_CHANGELOG_URL },
    { title: 'Obsidian 1.13.7 Desktop (Public)', url: DESKTOP_CHANGELOG_URL },
    { title: 'Obsidian 1.13.7 Desktop (Early access)', url: DESKTOP_EARLY_ACCESS_CHANGELOG_URL }
  ],
  desktopReleases: {
    beta: {
      latestVersion: '1.13.7',
      minimumVersion: '1.1.9'
    },
    latestVersion: '1.13.7',
    minimumVersion: '1.1.9'
  },
  /* eslint-disable camelcase -- GitHub publishes the tag as `tag_name`; a fixture that renamed it would stop matching the payload it stands in for. */
  gitHubReleases: [
    {
      assets: [{ name: 'Obsidian-1.13.8.apk' }],
      body: MOBILE_CHANGELOG_URL,
      tag_name: 'v1.13.8'
    },
    {
      assets: [{ name: 'Obsidian-1.13.7.exe' }, { name: 'obsidian-1.13.7.asar.gz' }],
      body: DESKTOP_CHANGELOG_URL,
      tag_name: 'v1.13.7'
    }
  ],
  /* eslint-enable camelcase -- GitHub publishes the tag as `tag_name`; a fixture that renamed it would stop matching the payload it stands in for. */
  metadata: null
};

const DESKTOP: PlatformSnapshot = {
  appVersion: '1.13.6',
  electronVersion: '34.5.8',
  installerVersion: '1.13.4',
  isAndroidApp: false,
  isDesktopApp: true,
  isInsiderBuild: false
};

const ANDROID: PlatformSnapshot = {
  appVersion: '1.13.7',
  electronVersion: null,
  installerVersion: null,
  isAndroidApp: true,
  isDesktopApp: false,
  isInsiderBuild: null
};

describe('resolveAppStreamStatus', () => {
  it('should report the public desktop release as the update', () => {
    const status = resolveAppStreamStatus(FEEDS, DESKTOP);
    expect(status).toEqual({
      changelogUrl: DESKTOP_CHANGELOG_URL,
      currentVersion: '1.13.6',
      id: ReleaseStreamId.App,
      isUpdateAvailable: true,
      latestVersion: '1.13.7'
    });
  });

  it('should never surface minimumVersion', () => {
    // `minimumVersion` is the floor auto-update will upgrade FROM. Presenting it as a version to be on
    // Would tell a 1.13.6 user they are ahead of where they need to be, which is the opposite of the
    // Point.
    const status = resolveAppStreamStatus(FEEDS, DESKTOP);
    expect(status.latestVersion).not.toBe(FEEDS.desktopReleases.minimumVersion);
    expect(status.latestVersion).toBe(FEEDS.desktopReleases.latestVersion);
  });

  it('should read the Android release rather than the desktop feed on mobile', () => {
    const status = resolveAppStreamStatus(FEEDS, ANDROID);
    expect(status.latestVersion).toBe('1.13.8');
    expect(status.changelogUrl).toBe(MOBILE_CHANGELOG_URL);
    expect(status.isUpdateAvailable).toBe(true);
  });

  it('should report no update when the running version is already the latest', () => {
    const status = resolveAppStreamStatus(FEEDS, { ...DESKTOP, appVersion: '1.13.7' });
    expect(status.isUpdateAvailable).toBe(false);
  });

  it('should report no update when the running version is unknown', () => {
    const status = resolveAppStreamStatus(FEEDS, { ...DESKTOP, appVersion: null });
    expect(status.isUpdateAvailable).toBe(false);
  });
});

describe('resolveBetaStreamStatus', () => {
  it('should prefer the early-access changelog entry', () => {
    const status = resolveBetaStreamStatus(FEEDS, DESKTOP);
    expect(status.latestVersion).toBe('1.13.7');
    expect(status.changelogUrl).toBe(DESKTOP_EARLY_ACCESS_CHANGELOG_URL);
    expect(status.isUpdateAvailable).toBe(true);
  });

  it('should look for the mobile changelog entry on mobile', () => {
    const status = resolveBetaStreamStatus(FEEDS, ANDROID);
    expect(status.changelogUrl).toBe(CHANGELOG_INDEX_URL);
  });

  it('should degrade to the changelog index when the feed carries no beta channel', () => {
    const feeds: ReleaseFeeds = { ...FEEDS, desktopReleases: { latestVersion: '1.13.7', minimumVersion: '1.1.9' } };
    const status = resolveBetaStreamStatus(feeds, DESKTOP);
    expect(status.latestVersion).toBeNull();
    expect(status.isUpdateAvailable).toBe(false);
    expect(status.changelogUrl).toBe(CHANGELOG_INDEX_URL);
  });
});

describe('resolveInstallerStreamStatus', () => {
  it('should skip the mobile-only newest release and read the changelog off the desktop release', () => {
    const status = resolveInstallerStreamStatus(FEEDS, DESKTOP);
    expect(status).toEqual({
      changelogUrl: DESKTOP_CHANGELOG_URL,
      currentVersion: '1.13.4',
      id: ReleaseStreamId.Installer,
      isUpdateAvailable: true,
      latestVersion: '1.13.7'
    });
  });

  it('should fall back to the changelog feed when the release body is not a changelog URL', () => {
    const feeds: ReleaseFeeds = {
      ...FEEDS,
      gitHubReleases: [{
        assets: [{ name: 'Obsidian-1.13.7.exe' }],
        body: 'Some release notes.',
        /* eslint-disable-next-line camelcase -- GitHub publishes the tag as `tag_name`; a fixture that renamed it would stop matching the payload it stands in for. */
        tag_name: 'v1.13.7'
      }]
    };

    expect(resolveInstallerStreamStatus(feeds, DESKTOP).changelogUrl).toBe(DESKTOP_CHANGELOG_URL);
  });

  it('should not apply on mobile', () => {
    const status = resolveInstallerStreamStatus(FEEDS, ANDROID);
    expect(status.currentVersion).toBeNull();
    expect(status.latestVersion).toBeNull();
    expect(status.isUpdateAvailable).toBe(false);
  });
});

describe('checkIsElectronOutdated', () => {
  it.each([
    ['28.2.2', true],
    [MIN_RECOMMENDED_ELECTRON_VERSION, false],
    ['34.5.8', false],
    [null, false]
  ])('should report %s as outdated: %s', (electronVersion: null | string, isOutdatedExpected: boolean) => {
    expect(checkIsElectronOutdated(electronVersion)).toBe(isOutdatedExpected);
  });

  it('should compare against a supplied floor rather than the hard-coded one', () => {
    expect(checkIsElectronOutdated('34.5.8', '40.0.0')).toBe(true);
  });
});

/*
 * The enrichment feed is consulted FIRST and never INSTEAD. Each test below therefore has to show two
 * things: that a metadata answer wins, and that its absence leaves the pre-existing chain producing
 * exactly what it produced before this feed existed. `metadata: null` in the shared FEEDS fixture is the
 * second half of that, asserted by every other test in this file.
 */
describe('the metadata feed as a changelog source', () => {
  const METADATA_DESKTOP_URL = 'https://obsidian.md/changelog/from-metadata-desktop/';
  const METADATA_MOBILE_URL = 'https://obsidian.md/changelog/from-metadata-mobile/';

  const METADATA: ObsidianMetadata = {
    '1.13.7': {
      changelogUrl: {
        desktop: METADATA_DESKTOP_URL,
        desktopCatalyst: 'https://obsidian.md/changelog/from-metadata-desktop-catalyst/'
      }
    },
    '1.13.8': { changelogUrl: { mobile: METADATA_MOBILE_URL } }
  };

  const ENRICHED_FEEDS: ReleaseFeeds = {
    ...FEEDS,
    metadata: METADATA
  };

  it('should win over matching a title in the changelog feed, on the app stream', () => {
    expect(resolveAppStreamStatus(ENRICHED_FEEDS, DESKTOP).changelogUrl).toBe(METADATA_DESKTOP_URL);
  });

  it('should resolve the mobile target on Android rather than the desktop one', () => {
    expect(resolveAppStreamStatus(ENRICHED_FEEDS, ANDROID).changelogUrl).toBe(METADATA_MOBILE_URL);
  });

  it('should win over the Catalyst title match on the beta stream', () => {
    expect(resolveBetaStreamStatus(ENRICHED_FEEDS, DESKTOP).changelogUrl).toBe('https://obsidian.md/changelog/from-metadata-desktop-catalyst/');
  });

  it('should win over the release body on the installer stream', () => {
    expect(resolveInstallerStreamStatus(ENRICHED_FEEDS, DESKTOP).changelogUrl).toBe(METADATA_DESKTOP_URL);
  });

  it('should leave the existing chain intact for a version it has no entry for', () => {
    // The lag made real: on 2026-08-30 GitHub had v1.13.8 while the feed's newest entry was 1.13.7.
    const staleMetadata: ReleaseFeeds = {
      ...FEEDS,
      metadata: { '1.13.6': { changelogUrl: { desktop: METADATA_DESKTOP_URL } } }
    };

    expect(resolveAppStreamStatus(staleMetadata, DESKTOP).changelogUrl).toBe(DESKTOP_CHANGELOG_URL);
  });
});

describe('resolveElectronStatus', () => {
  it('should report the running Electron and no target while the feed records none', () => {
    // The production state today — no 1.13.x entry carries `runtimeVersions` (`T717-P2`).
    expect(resolveElectronStatus(FEEDS, DESKTOP)).toEqual({
      currentVersion: '34.5.8',
      isOutdated: false,
      minRecommendedVersion: MIN_RECOMMENDED_ELECTRON_VERSION,
      targetVersion: null
    });
  });

  it('should read the newest installer\'s Electron once the feed records it', () => {
    const feeds: ReleaseFeeds = {
      ...FEEDS,
      metadata: { '1.13.7': { runtimeVersions: { electron: '39.8.3' } } }
    };

    expect(resolveElectronStatus(feeds, DESKTOP).targetVersion).toBe('39.8.3');
  });

  it('should prefer the floor the feed records for the running version over the hard-coded one', () => {
    const feeds: ReleaseFeeds = {
      ...FEEDS,
      metadata: { '1.13.6': { minRecommendedElectronVersion: '40.0.0' } }
    };

    const status = resolveElectronStatus(feeds, DESKTOP);
    expect(status.minRecommendedVersion).toBe('40.0.0');
    expect(status.isOutdated).toBe(true);
  });

  it('should report nothing about Electron on mobile, where there is none', () => {
    expect(resolveElectronStatus(FEEDS, ANDROID)).toEqual({
      currentVersion: null,
      isOutdated: false,
      minRecommendedVersion: MIN_RECOMMENDED_ELECTRON_VERSION,
      targetVersion: null
    });
  });
});

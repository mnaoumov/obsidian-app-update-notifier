import {
  describe,
  expect,
  it
} from 'vitest';

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
  ]
  /* eslint-enable camelcase -- GitHub publishes the tag as `tag_name`; a fixture that renamed it would stop matching the payload it stands in for. */
};

const DESKTOP: PlatformSnapshot = {
  appVersion: '1.13.6',
  electronVersion: '34.5.8',
  installerVersion: '1.13.4',
  isAndroidApp: false,
  isDesktopApp: true
};

const ANDROID: PlatformSnapshot = {
  appVersion: '1.13.7',
  electronVersion: null,
  installerVersion: null,
  isAndroidApp: true,
  isDesktopApp: false
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
});

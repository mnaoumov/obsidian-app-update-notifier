import type { App as AppOriginal } from 'obsidian';
import type { PluginNoticeComponent } from 'obsidian-dev-utils/obsidian/components/plugin-notice-component';

import { Platform } from 'obsidian';
import { castTo } from 'obsidian-dev-utils/object-utils';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import { App } from 'obsidian-test-mocks/obsidian';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { PluginSettingsComponent } from './plugin-settings-component.ts';

import { fetchObsidianMetadata } from './obsidian-metadata-api.ts';
import {
  fetchChangelogEntries,
  fetchDesktopReleases,
  fetchGitHubReleases
} from './obsidian-releases-api.ts';
import {
  checkIsInsiderBuild,
  getAppVersion,
  getElectronVersion,
  getInstallerVersion
} from './platform-ex.ts';
import { PluginSettings } from './plugin-settings.ts';
import { ReleaseStreamId } from './release-streams.ts';
import { UpdateCheckerComponent } from './update-checker-component.ts';

interface MutablePlatform {
  isAndroidApp: boolean;
  isDesktopApp: boolean;
}

vi.mock('obsidian', async (importOriginal) => ({
  ...await importOriginal<typeof import('obsidian')>(),
  Platform: {
    isAndroidApp: false,
    isDesktopApp: true
  }
}));

vi.mock('./obsidian-metadata-api.ts', async (importOriginal) => ({
  ...await importOriginal<typeof import('./obsidian-metadata-api.ts')>(),
  fetchObsidianMetadata: vi.fn()
}));

vi.mock('./obsidian-releases-api.ts', async (importOriginal) => ({
  ...await importOriginal<typeof import('./obsidian-releases-api.ts')>(),
  fetchChangelogEntries: vi.fn(),
  fetchDesktopReleases: vi.fn(),
  fetchGitHubReleases: vi.fn()
}));

vi.mock('./platform-ex.ts', () => ({
  checkIsInsiderBuild: vi.fn(),
  getAppVersion: vi.fn(),
  getDownloadUrl: vi.fn(() => 'https://obsidian.md/download?os=win&arch=x64'),
  getElectronVersion: vi.fn(),
  getInstallerVersion: vi.fn()
}));

const DESKTOP_CHANGELOG_URL = 'https://obsidian.md/changelog/2026-08-12-desktop-v1.13.7/';

const platform = castTo<MutablePlatform>(Platform);
const showNotice = vi.fn();
const checkShouldWatchBetaStream = vi.fn();
const checkWasNotified = vi.fn();
const recordNotified = vi.fn();

let app: AppOriginal;
let settings: PluginSettings;
let layoutReadyCallbacks: (() => void)[];

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();

  platform.isAndroidApp = false;
  platform.isDesktopApp = true;
  settings = new PluginSettings();
  layoutReadyCallbacks = [];

  const appMock = App.createConfigured__();
  appMock.workspace.onLayoutReady = vi.fn((callback: () => void) => {
    layoutReadyCallbacks.push(callback);
  });
  app = appMock.asOriginalType__();

  vi.mocked(getAppVersion).mockReturnValue('1.13.6');
  vi.mocked(getInstallerVersion).mockReturnValue('1.13.4');
  vi.mocked(getElectronVersion).mockReturnValue('34.5.8');
  vi.mocked(checkIsInsiderBuild).mockReturnValue(false);

  // The real feed records nothing for any current version (`T717-P2`), so an empty index is the
  // Production default rather than a degenerate fixture. Individual tests populate it.
  vi.mocked(fetchObsidianMetadata).mockResolvedValue({});

  vi.mocked(fetchChangelogEntries).mockResolvedValue([
    { title: 'Obsidian 1.13.7 Desktop (Public)', url: DESKTOP_CHANGELOG_URL }
  ]);
  vi.mocked(fetchDesktopReleases).mockResolvedValue({
    beta: { latestVersion: '1.13.7', minimumVersion: '1.1.9' },
    latestVersion: '1.13.7',
    minimumVersion: '1.1.9'
  });
  vi.mocked(fetchGitHubReleases).mockResolvedValue([{
    assets: [{ name: 'Obsidian-1.13.7.exe' }],
    body: DESKTOP_CHANGELOG_URL,
    /* eslint-disable-next-line camelcase -- GitHub publishes the tag as `tag_name`; renaming it in the fixture would stop it matching the payload. */
    tag_name: 'v1.13.7'
  }]);

  checkShouldWatchBetaStream.mockReturnValue(false);
  checkWasNotified.mockReturnValue(false);
  recordNotified.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('check', () => {
  it('should record what every watched stream found', async () => {
    const component = createComponent();

    await component.check();

    expect(component.lastResult?.statuses.map((status) => status.id)).toEqual([ReleaseStreamId.App, ReleaseStreamId.Installer]);
  });

  it('should notify listeners so the status bar redraws', async () => {
    const component = createComponent();
    const listener = vi.fn();
    component.addResultListener(listener);

    await component.check();

    expect(listener).toHaveBeenCalledOnce();
  });

  it('should keep the last successful result when a later check fails', async () => {
    const component = createComponent();
    await component.check();
    const lastResult = component.lastResult;

    vi.mocked(fetchDesktopReleases).mockRejectedValue(new Error('offline'));
    await component.check();

    // Going offline must never turn "cannot tell" into "up to date".
    expect(component.lastResult).toBe(lastResult);
  });

  it('should stay silent about a failed scheduled check', async () => {
    vi.mocked(fetchDesktopReleases).mockRejectedValue(new Error('offline'));

    await createComponent().check();

    expect(showNotice).not.toHaveBeenCalled();
  });

  it('should report a failed check that the user asked for', async () => {
    vi.mocked(fetchDesktopReleases).mockRejectedValue(new Error('offline'));

    await createComponent().check(true);

    expect(showNotice).toHaveBeenCalledOnce();
  });

  it('should succeed anyway when only the enrichment feed fails', async () => {
    /*
     * The asymmetry that defines the fourth feed. Obsidian's own three are the answer, so their failure
     * fails the check (asserted above). The metadata mirror only ever supplies a PREFERRED answer over
     * one the others already give, so its being down must degrade the notice and never the check —
     * otherwise a third-party repo going offline would silently stop this plugin reporting updates.
     */
    vi.mocked(fetchObsidianMetadata).mockRejectedValue(new Error('offline'));

    const component = createComponent();
    await component.check();

    expect(component.lastResult?.statuses.map((status) => status.id)).toEqual([ReleaseStreamId.App, ReleaseStreamId.Installer]);
    expect(component.lastResult?.statuses[0]?.changelogUrl).toBe(DESKTOP_CHANGELOG_URL);
    expect(showNotice).not.toHaveBeenCalledWith('Could not check for Obsidian updates. See the console for details.');
  });
});

describe('notifications', () => {
  it('should announce each newly discovered version once and record it', async () => {
    const component = createComponent();

    await component.check();

    expect(showNotice).toHaveBeenCalledTimes(2);
    expect(recordNotified).toHaveBeenCalledWith(ReleaseStreamId.App, '1.13.7');
    expect(recordNotified).toHaveBeenCalledWith(ReleaseStreamId.Installer, '1.13.7');
  });

  it('should never announce a version twice', async () => {
    checkWasNotified.mockReturnValue(true);
    const component = createComponent();

    await component.check();

    expect(showNotice).not.toHaveBeenCalled();
    expect(recordNotified).not.toHaveBeenCalled();
  });

  it('should say nothing when nothing is out of date', async () => {
    vi.mocked(getAppVersion).mockReturnValue('1.13.7');
    vi.mocked(getInstallerVersion).mockReturnValue('1.13.7');

    await createComponent().check();

    expect(showNotice).not.toHaveBeenCalled();
  });
});

describe('which streams are watched', () => {
  it('should add the beta stream when the settings say to watch it', async () => {
    checkShouldWatchBetaStream.mockReturnValue(true);
    const component = createComponent();

    await component.check();

    expect(component.lastResult?.statuses.map((status) => status.id)).toContain(ReleaseStreamId.Beta);
  });

  it('should drop the installer stream when it is switched off', async () => {
    settings.shouldWatchInstallerStream = false;
    const component = createComponent();

    await component.check();

    expect(component.lastResult?.statuses.map((status) => status.id)).not.toContain(ReleaseStreamId.Installer);
  });

  it('should drop the installer stream on mobile whatever the setting says', async () => {
    platform.isDesktopApp = false;
    platform.isAndroidApp = true;
    const component = createComponent();

    await component.check();

    expect(component.lastResult?.statuses.map((status) => status.id)).toEqual([ReleaseStreamId.App]);
  });

  it('should watch nothing on iOS, where Obsidian publishes no feed at all', async () => {
    platform.isDesktopApp = false;
    platform.isAndroidApp = false;
    const component = createComponent();

    await component.check();

    expect(component.lastResult?.statuses).toEqual([]);
    expect(showNotice).not.toHaveBeenCalled();
  });
});

describe('scheduling', () => {
  it('should check once the layout is ready', async () => {
    const component = createComponent();
    component.load();

    for (const callback of layoutReadyCallbacks) {
      callback();
    }
    await vi.runOnlyPendingTimersAsync();

    expect(component.lastResult).not.toBeNull();
    component.unload();
  });

  it('should not check again before the interval has elapsed', async () => {
    const component = createComponent();
    await component.check();
    vi.mocked(fetchDesktopReleases).mockClear();

    await vi.advanceTimersByTimeAsync(0);
    component.load();
    await vi.advanceTimersByTimeAsync(5 * 60_000);

    expect(fetchDesktopReleases).not.toHaveBeenCalled();
    component.unload();
  });

  it('should check again once the interval has elapsed', async () => {
    const component = createComponent();
    await component.check();
    vi.mocked(fetchDesktopReleases).mockClear();
    component.load();

    await vi.advanceTimersByTimeAsync(61 * 60_000);

    expect(fetchDesktopReleases).toHaveBeenCalled();
    component.unload();
  });

  it('should never check on a schedule when the interval is zero', async () => {
    settings.checkIntervalInMinutes = 0;
    const component = createComponent();
    component.load();

    await vi.advanceTimersByTimeAsync(24 * 60 * 60_000);

    expect(fetchDesktopReleases).not.toHaveBeenCalled();
    component.unload();
  });
});

function createComponent(): UpdateCheckerComponent {
  return new UpdateCheckerComponent({
    app,
    pluginNoticeComponent: strictProxy<PluginNoticeComponent>({ showNotice }),
    pluginSettingsComponent: castTo<PluginSettingsComponent>(strictProxy({
      checkShouldWatchBetaStream,
      checkWasNotified,
      recordNotified,
      get settings() {
        return settings;
      }
    }))
  });
}

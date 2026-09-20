import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { ElectronStatus } from './release-streams.ts';

import {
  MIN_RECOMMENDED_ELECTRON_VERSION,
  ReleaseStreamId
} from './release-streams.ts';
import {
  appendUpdateActions,
  EARLY_ACCESS_URL
} from './update-actions.ts';

const DOWNLOAD_URL = 'https://obsidian.md/download?os=win&arch=x64';

vi.mock('./platform-ex.ts', () => ({
  getDownloadUrl: vi.fn(() => DOWNLOAD_URL)
}));

/**
 * What the Electron half looks like TODAY: `targetVersion` is `null` for every current Obsidian,
 * because the metadata feed's `runtimeVersions` is absent for every 1.13.x.
 */
const ELECTRON: ElectronStatus = {
  currentVersion: '34.5.8',
  isOutdated: false,
  minRecommendedVersion: MIN_RECOMMENDED_ELECTRON_VERSION,
  targetVersion: null
};

let containerEl: HTMLElement;

beforeEach(() => {
  vi.clearAllMocks();
  containerEl = createDiv();
});

describe('the install routes', () => {
  it.each([ReleaseStreamId.App, ReleaseStreamId.Installer])('should offer both routes on the %s stream', (streamId) => {
    render(streamId);

    const link = containerEl.querySelector('a');
    expect(link?.textContent).toBe('Update with new installer (recommended)');
    expect(link?.getAttribute('href')).toBe(DOWNLOAD_URL);
    expect(containerEl.textContent).toContain('Update app only, without installer: Settings → General → Check for updates');
  });

  it('should name the tab by its DISPLAY name, not its internal id', () => {
    // The tab's id is `about` (`app.js:202140`); "General" is what the user actually reads on the
    // Settings sidebar. Naming the id would send someone looking for a tab that is not there.
    render(ReleaseStreamId.App);

    expect(containerEl.textContent).toContain('Settings → General');
    expect(containerEl.textContent).not.toContain('about');
  });

  it('should render into a DocumentFragment as readily as an element, because a Notice is built from one', () => {
    const fragment = createFragment();
    appendUpdateActions(fragment, {
      electron: ELECTRON,
      isDesktopApp: true,
      isInsiderBuild: false,
      streamId: ReleaseStreamId.App
    });

    expect(fragment.querySelector('a')?.textContent).toBe('Update with new installer (recommended)');
  });
});

describe('the install routes on mobile', () => {
  it('should offer ONE route, because neither desktop sentence is true on a phone', () => {
    /*
     * There is no installer on Android — the mobile details panel omits the installer stream for that
     * reason — and `Settings → General → Check for updates` is the DESKTOP About tab, which mobile does
     * not have. Both were rendered on mobile until 2026-09-20, in a frame the store listing showed.
     */
    renderMobile(ReleaseStreamId.App);

    const links = [...containerEl.querySelectorAll('a')];
    expect(links.map((link) => link.textContent)).toStrictEqual(['Update Obsidian']);
    expect(links[0]?.getAttribute('href')).toBe(DOWNLOAD_URL);
    expect(containerEl.textContent).not.toContain('installer');
    expect(containerEl.textContent).not.toContain('Settings → General');
  });

  it('should still offer that route, rather than leaving an announced update with nowhere to go', () => {
    // These actions are only ever rendered for a stream that HAS an update, so suppressing them on
    // mobile would tell a reader an update exists and then offer nothing.
    renderMobile(ReleaseStreamId.App);

    expect(containerEl.querySelector('a')).not.toBeNull();
  });
});

describe('the Catalyst gate', () => {
  it.each([
    ['the insider toggle is off', false],
    ['the insider toggle cannot be read, as on mobile', null]
  ])('should ask for a license when %s', (_description, isInsiderBuild) => {
    render(ReleaseStreamId.Beta, ELECTRON, isInsiderBuild);

    expect(containerEl.textContent).toContain('needs a Catalyst license');
    expect(containerEl.querySelector('a')?.getAttribute('href')).toBe(EARLY_ACCESS_URL);
  });

  it('should never claim the reader has no license, which the plugin cannot know', () => {
    /*
     * `insider-build` reading `false` is ambiguous: no license, OR licensed with the toggle off.
     * Obsidian only hides and forces the toggle in the FIRST case (`app.js:202195-202197`), and the
     * license itself lives on a module-private singleton with no supported read. So the sentence has to
     * be true for both readers.
     */
    render(ReleaseStreamId.Beta, ELECTRON, false);

    const text = containerEl.textContent;
    expect(text).not.toContain('you do not have');
    expect(text).not.toContain('You do not have');
    expect(text).toContain('switched on in Settings → General');
  });

  it('should offer the install route instead once the toggle is on, which implies a license', () => {
    render(ReleaseStreamId.Beta, ELECTRON, true);

    expect(containerEl.textContent).not.toContain('needs a Catalyst license');
    expect(containerEl.querySelector('a')?.textContent).toBe('Update with new installer (recommended)');
  });

  it('should not gate the other streams, which need no license at all', () => {
    render(ReleaseStreamId.App, ELECTRON, false);
    expect(containerEl.textContent).not.toContain('needs a Catalyst license');
  });
});

describe('the Catalyst gate on mobile', () => {
  it('should name the channel a phone can actually reach, not the desktop About tab', () => {
    /*
     * Verified 2026-09-20 against Obsidian's own early-access page: mobile has no insider toggle and no
     * `Settings → General` tab to put one on. The route is the Catalyst license, the Discord badge it
     * grants, and the insider channels — a TestFlight link on iOS, an APK on Android, both posted
     * there. Until this was fixed the gate sent a mobile reader to a tab that does not exist.
     */
    renderMobile(ReleaseStreamId.Beta);

    expect(containerEl.textContent).toContain('needs a Catalyst license');
    expect(containerEl.textContent).toContain('insider Discord channels rather than the app store');
    expect(containerEl.textContent).not.toContain('Settings → General');
  });

  it('should still link the page the steps are written on, which is the instructions and not the download', () => {
    renderMobile(ReleaseStreamId.Beta);

    const links = [...containerEl.querySelectorAll('a')];
    expect(links.map((link) => link.textContent)).toStrictEqual(['Read about Catalyst and early access']);
    expect(links[0]?.getAttribute('href')).toBe(EARLY_ACCESS_URL);
  });

  it('should never claim the reader has no license here either, the toggle being unreadable on mobile', () => {
    // `checkIsInsiderBuild` answers `null` on mobile, so this gate is the ONLY branch the beta stream can
    // take there — including for someone already running an insider build. It describes the channel
    // rather than telling that reader to go and get on it.
    renderMobile(ReleaseStreamId.Beta);

    const text = containerEl.textContent;
    expect(text).not.toContain('you do not have');
    expect(text).not.toContain('You do not have');
  });
});

describe('the Electron sentence', () => {
  it('should name both versions when both are known', () => {
    render(ReleaseStreamId.Installer, {
      ...ELECTRON,
      targetVersion: '39.8.3'
    });

    expect(containerEl.textContent).toContain('Your Electron version 34.5.8, latest installer has Electron version 39.8.3');
  });

  it.each([
    ['the newest installer\'s Electron is not recorded', { targetVersion: null }],
    ['this is mobile, where there is no Electron', { currentVersion: null, targetVersion: '39.8.3' }],
    ['the newest installer would not move it', { targetVersion: '34.5.8' }]
  ])('should stay silent when %s', (_description, overrides) => {
    render(ReleaseStreamId.Installer, {
      ...ELECTRON,
      ...overrides
    });

    expect(containerEl.textContent).not.toContain('latest installer has Electron version');
  });
});

function render(streamId: ReleaseStreamId, electron: ElectronStatus = ELECTRON, isInsiderBuild: boolean | null = false): void {
  appendUpdateActions(containerEl, {
    electron,
    isDesktopApp: true,
    isInsiderBuild,
    streamId
  });
}

/**
 * Renders as mobile does: no desktop app, and therefore no readable insider toggle.
 *
 * @param streamId - Which stream's routes to render.
 */
function renderMobile(streamId: ReleaseStreamId): void {
  appendUpdateActions(containerEl, {
    electron: {
      ...ELECTRON,
      currentVersion: null
    },
    isDesktopApp: false,
    isInsiderBuild: null,
    streamId
  });
}

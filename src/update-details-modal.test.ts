import type { App as AppOriginal } from 'obsidian';
import type { ModalBase } from 'obsidian-dev-utils/obsidian/modals/modal';

import { noopAsync } from 'obsidian-dev-utils/function';
import { showModal } from 'obsidian-dev-utils/obsidian/modals/modal';
import { App } from 'obsidian-test-mocks/obsidian';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type {
  ElectronStatus,
  PlatformSnapshot,
  ReleaseStreamStatus
} from './release-streams.ts';
import type { UpdateCheckResult } from './update-checker-component.ts';

import { fetchElectronStableVersions } from './electron-releases-api.ts';
import {
  MIN_RECOMMENDED_ELECTRON_VERSION,
  ReleaseStreamId
} from './release-streams.ts';
import { showUpdateDetails } from './update-details-modal.ts';

vi.mock('obsidian-dev-utils/obsidian/modals/modal', async (importOriginal) => ({
  ...await importOriginal<typeof import('obsidian-dev-utils/obsidian/modals/modal')>(),
  showModal: vi.fn()
}));

vi.mock('./platform-ex.ts', () => ({
  getDownloadUrl: vi.fn(() => 'https://obsidian.md/download?os=win&arch=x64')
}));

/**
 * Mocked because the real one fetches a 1.28 MB index. The modal is the ONLY caller, so mocking it here
 * is also what keeps the unit suite from ever reaching the network.
 */
vi.mock('./electron-releases-api.ts', async (importOriginal) => ({
  ...await importOriginal<typeof import('./electron-releases-api.ts')>(),
  fetchElectronStableVersions: vi.fn()
}));

const mockedFetchElectronStableVersions = vi.mocked(fetchElectronStableVersions);

const DESKTOP: PlatformSnapshot = {
  appVersion: '1.13.6',
  electronVersion: '34.5.8',
  installerVersion: '1.13.4',
  isAndroidApp: false,
  isDesktopApp: true,
  isInsiderBuild: false
};

/**
 * What the Electron half looks like TODAY: the running version is known, the target is not, because
 * the metadata feed's `runtimeVersions` is absent for every current Obsidian (`T717-P2`). The span
 * tests below override `targetVersion` to exercise the branch that is dark in production.
 */
const ELECTRON: ElectronStatus = {
  currentVersion: '34.5.8',
  isOutdated: false,
  minRecommendedVersion: MIN_RECOMMENDED_ELECTRON_VERSION,
  targetVersion: null
};

const promiseResolve = vi.fn();

let app: AppOriginal;
let openedModal: ModalBase<void> | null;

beforeEach(() => {
  vi.clearAllMocks();
  app = App.createConfigured__().asOriginalType__();
  openedModal = null;
  // Deliberately does NOT close the modal. The Electron span is filled in after an `await`, and a
  // Harness that closed immediately would exercise only the already-closed path — which is the one
  // Branch that must NOT render. Closing is driven explicitly by the tests that mean to.
  vi.mocked(showModal).mockImplementation((modalCreator) => {
    const modal = modalCreator(promiseResolve) as ModalBase<void>;
    openedModal = modal;
    modal.onOpen();
    return noopAsync();
  });
});

describe('when no check has succeeded', () => {
  it('should say so rather than show an empty panel', async () => {
    const contentEl = await render(null);
    expect(contentEl.textContent).toContain('No check has succeeded yet');
  });
});

describe('when the platform has no release feed', () => {
  it('should say so rather than list nothing', async () => {
    const contentEl = await render(createResult([]));
    expect(contentEl.textContent).toContain('no release feed for this platform');
  });
});

describe('when there are streams to show', () => {
  it('should give each stream its own heading', async () => {
    const contentEl = await render(createResult([
      createStatus(ReleaseStreamId.App, true),
      createStatus(ReleaseStreamId.Beta, false),
      createStatus(ReleaseStreamId.Installer, true)
    ]));

    expect([...contentEl.querySelectorAll('h3')].map((el) => el.textContent)).toEqual(['App', 'Insider build', 'Installer']);
  });

  it('should show what is installed against what is published', async () => {
    const contentEl = await render(createResult([createStatus(ReleaseStreamId.App, true)]));

    expect(contentEl.textContent).toContain('Installed: 1.13.6');
    expect(contentEl.textContent).toContain('Latest: 1.13.7');
    expect(contentEl.textContent).toContain('An update is available.');
  });

  it('should say when a stream is up to date', async () => {
    const contentEl = await render(createResult([createStatus(ReleaseStreamId.App, false)]));
    expect(contentEl.textContent).toContain('Up to date.');
  });

  it('should say when a stream could not be compared', async () => {
    const contentEl = await render(createResult([{
      ...createStatus(ReleaseStreamId.App, false),
      latestVersion: null
    }]));

    expect(contentEl.textContent).toContain('Latest: unknown');
    expect(contentEl.textContent).toContain('Could not be compared.');
  });

  it('should say the installed version is unknown rather than print nothing', async () => {
    const contentEl = await render(createResult([{
      ...createStatus(ReleaseStreamId.Installer, false),
      currentVersion: null
    }]));

    expect(contentEl.textContent).toContain('Installed: unknown');
  });

  it('should link the changelog for every stream', async () => {
    const contentEl = await render(createResult([createStatus(ReleaseStreamId.App, true)]));

    const links = [...contentEl.querySelectorAll('a')];
    expect(links.map((link) => link.textContent)).toContain('Changelog');
  });

  it('should offer both install routes for an update on any stream', async () => {
    // Superseded the old "download only for an installer update" rule. Replacing the installer is now
    // Offered for an APP update too, because it is the route that also moves Electron — and the app-only
    // Route is named beside it, so the choice is the reader's rather than the plugin's.
    for (const streamId of [ReleaseStreamId.App, ReleaseStreamId.Installer]) {
      const contentEl = await render(createResult([createStatus(streamId, true)]));
      expect([...contentEl.querySelectorAll('a')].map((link) => link.textContent)).toContain('Update with new installer (recommended)');
      expect(contentEl.textContent).toContain('Settings → General → Check for updates');
    }
  });

  it('should offer no install route for a stream that is up to date', async () => {
    const contentEl = await render(createResult([createStatus(ReleaseStreamId.App, false)]));
    expect(contentEl.querySelector('.app-update-notifier-actions')).toBeNull();
  });

  it('should gate a Catalyst update behind the license when the insider toggle is off', async () => {
    const contentEl = await render(createResult([createStatus(ReleaseStreamId.Beta, true)]));

    expect(contentEl.textContent).toContain('needs a Catalyst license');
    expect([...contentEl.querySelectorAll('a')].map((link) => link.getAttribute('href'))).toContain('https://obsidian.md/help/early-access');
    // The plugin cannot read the license, so it must never claim the reader lacks one.
    expect(contentEl.textContent).not.toContain('you do not have');
  });

  it('should offer the install route for a Catalyst update when the insider toggle is on, which implies a license', async () => {
    const contentEl = await render(createResult([createStatus(ReleaseStreamId.Beta, true)], ELECTRON, {
      ...DESKTOP,
      isInsiderBuild: true
    }));

    expect([...contentEl.querySelectorAll('a')].map((link) => link.textContent)).toContain('Update with new installer (recommended)');
    expect(contentEl.textContent).not.toContain('needs a Catalyst license');
  });

  it('should record when the check ran', async () => {
    const contentEl = await render(createResult([createStatus(ReleaseStreamId.App, true)]));
    expect(contentEl.textContent).toContain('Last checked');
  });
});

describe('the Electron row', () => {
  it('should report the bundled version', async () => {
    const contentEl = await render(createResult([createStatus(ReleaseStreamId.App, false)]));
    expect(contentEl.textContent).toContain('34.5.8');
    expect(contentEl.textContent).not.toContain('which some Obsidian features require');
  });

  it('should warn and offer the download when Electron is below the floor Obsidian itself checks', async () => {
    const contentEl = await render(createResult([createStatus(ReleaseStreamId.App, false)], {
      ...ELECTRON,
      currentVersion: '28.2.2',
      isOutdated: true
    }));

    expect(contentEl.textContent).toContain('which some Obsidian features require');
    expect([...contentEl.querySelectorAll('a')].map((link) => link.textContent)).toContain('the download page');
  });

  it('should name the floor the metadata feed supplied rather than the hard-coded one', async () => {
    const contentEl = await render(createResult([createStatus(ReleaseStreamId.App, false)], {
      ...ELECTRON,
      currentVersion: '29.0.0',
      isOutdated: true,
      minRecommendedVersion: '30.1.2'
    }));

    expect(contentEl.textContent).toContain('Below 30.1.2');
    expect(contentEl.textContent).not.toContain(`Below ${MIN_RECOMMENDED_ELECTRON_VERSION}`);
  });

  it('should be absent on mobile, where there is no Electron', async () => {
    const contentEl = await render(createResult([createStatus(ReleaseStreamId.App, false)], { ...ELECTRON, currentVersion: null }));
    expect(contentEl.querySelector('.app-update-notifier-electron')).toBeNull();
  });

  it('should say nothing about the newest installer while the metadata feed does not record its Electron', async () => {
    // The production state today: `runtimeVersions` is absent for every 1.13.x (`T717-P2`), so the
    // Span must stay dark rather than render "unknown".
    const contentEl = await render(createResult([createStatus(ReleaseStreamId.App, false)]));

    expect(contentEl.textContent).not.toContain('latest installer has Electron version');
    expect(contentEl.querySelector('.app-update-notifier-electron-span')).toBeNull();
  });

  it('should list the releases in between once the newest installer\'s Electron is known', async () => {
    mockedFetchElectronStableVersions.mockResolvedValue(['34.5.8', '35.0.0', '35.1.0', '36.0.0']);

    const contentEl = await render(createResult([createStatus(ReleaseStreamId.App, false)], { ...ELECTRON, targetVersion: '36.0.0' }));
    await waitForElectronSpan(contentEl);

    expect(contentEl.textContent).toContain('latest installer has Electron version 36.0.0');
    const spanLinks = [...contentEl.querySelectorAll(':scope .app-update-notifier-electron-span a')];
    expect(spanLinks.map((link) => link.textContent)).toEqual(['v35.0.0', 'v35.1.0', 'v36.0.0']);
    expect(spanLinks[0]?.getAttribute('href')).toBe('https://releases.electronjs.org/release/v35.0.0');
  });

  it('should render no list when the index names nothing in between', async () => {
    // Can happen the moment a new Electron ships: the metadata feed names the target before Electron's
    // Own index has been re-read, so the span resolves empty. An empty disclosure triangle would be
    // Worse than none.
    mockedFetchElectronStableVersions.mockResolvedValue(['34.5.8']);

    const contentEl = await render(createResult([createStatus(ReleaseStreamId.App, false)], { ...ELECTRON, targetVersion: '36.0.0' }));
    await waitForElectronSpan(contentEl);

    expect(contentEl.querySelector(':scope .app-update-notifier-electron-span details')).toBeNull();
    expect(contentEl.textContent).toContain('latest installer has Electron version 36.0.0');
  });

  it('should say how many releases it left out rather than truncate silently', async () => {
    const stableVersions = Array.from({ length: 40 }, (_value, index) => `${(35 + Math.floor(index / 10)).toString()}.0.${(index % 10).toString()}`);
    mockedFetchElectronStableVersions.mockResolvedValue(stableVersions);

    const contentEl = await render(createResult([createStatus(ReleaseStreamId.App, false)], { ...ELECTRON, targetVersion: '38.0.9' }));
    await waitForElectronSpan(contentEl);

    expect(contentEl.textContent).toContain('more not listed');
  });

  it('should say so rather than break the panel when Electron\'s release index cannot be read', async () => {
    mockedFetchElectronStableVersions.mockRejectedValue(new Error('offline'));

    const contentEl = await render(createResult([createStatus(ReleaseStreamId.App, false)], { ...ELECTRON, targetVersion: '36.0.0' }));
    await waitForElectronSpan(contentEl);

    expect(contentEl.textContent).toContain('Could not load the list of Electron releases in between');
  });

  /*
   * The next two need the fetch held OPEN across the close, which a `mockResolvedValue` cannot do: it
   * settles on the first microtask, so the span has already rendered by the time the test could close
   * anything. A real network takes long enough for a user to dismiss the panel, and that is the window
   * these two stand for.
   */
  it('should write nothing into a modal the user closed before the index arrived', async () => {
    const indexArrival = createDeferred<string[]>();
    mockedFetchElectronStableVersions.mockReturnValue(indexArrival.promise);

    const contentEl = await render(createResult([createStatus(ReleaseStreamId.App, false)], { ...ELECTRON, targetVersion: '36.0.0' }));
    closeOpenedModal();
    indexArrival.resolve(['35.0.0', '36.0.0']);
    await indexArrival.promise;

    expect(contentEl.querySelector(':scope .app-update-notifier-electron-span a')).toBeNull();
  });

  it('should say nothing into a modal the user closed before the index failed', async () => {
    const indexArrival = createDeferred<string[]>();
    mockedFetchElectronStableVersions.mockReturnValue(indexArrival.promise);

    const contentEl = await render(createResult([createStatus(ReleaseStreamId.App, false)], { ...ELECTRON, targetVersion: '36.0.0' }));
    closeOpenedModal();
    indexArrival.reject(new Error('offline'));
    await expect(indexArrival.promise).rejects.toThrow('offline');

    expect(contentEl.textContent).not.toContain('Could not load');
  });
});

describe('closing', () => {
  it('should resolve the caller\'s promise', async () => {
    await render(createResult([createStatus(ReleaseStreamId.App, false)]));
    closeOpenedModal();
    expect(promiseResolve).toHaveBeenCalledOnce();
  });
});

interface Deferred<T> {
  promise: Promise<T>;
  reject(error: Error): void;
  resolve(value: T): void;
}

function closeOpenedModal(): void {
  if (!openedModal) {
    throw new Error('The modal was never created.');
  }

  openedModal.onClose();
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((promiseResolveFunction, promiseRejectFunction) => {
    resolve = promiseResolveFunction;
    reject = promiseRejectFunction;
  });

  return {
    promise,
    reject,
    resolve
  };
}

function createResult(
  statuses: readonly ReleaseStreamStatus[],
  electron: ElectronStatus = ELECTRON,
  platform: PlatformSnapshot = DESKTOP
): UpdateCheckResult {
  return {
    checkedAtInMilliseconds: 1_756_000_000_000,
    electron,
    platform,
    statuses
  };
}

function createStatus(id: ReleaseStreamId, isUpdateAvailable: boolean): ReleaseStreamStatus {
  return {
    changelogUrl: 'https://obsidian.md/changelog/2026-08-12-desktop-v1.13.7/',
    currentVersion: '1.13.6',
    id,
    isUpdateAvailable,
    latestVersion: '1.13.7'
  };
}

async function render(result: null | UpdateCheckResult): Promise<HTMLElement> {
  await showUpdateDetails({ app, result });
  if (!openedModal) {
    throw new Error('The modal was never created.');
  }

  return openedModal.contentEl;
}

async function waitForElectronSpan(contentEl: HTMLElement): Promise<void> {
  await vi.waitFor(() => {
    expect(contentEl.textContent).not.toContain('Loading the Electron releases in between');
  });
}

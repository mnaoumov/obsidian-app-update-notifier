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
  PlatformSnapshot,
  ReleaseStreamStatus
} from './release-streams.ts';
import type { UpdateCheckResult } from './update-checker-component.ts';

import { ReleaseStreamId } from './release-streams.ts';
import { showUpdateDetails } from './update-details-modal.ts';

vi.mock('obsidian-dev-utils/obsidian/modals/modal', async (importOriginal) => ({
  ...await importOriginal<typeof import('obsidian-dev-utils/obsidian/modals/modal')>(),
  showModal: vi.fn()
}));

vi.mock('./platform-ex.ts', () => ({
  getDownloadUrl: vi.fn(() => 'https://obsidian.md/download?os=win&arch=x64')
}));

const DESKTOP: PlatformSnapshot = {
  appVersion: '1.13.6',
  electronVersion: '34.5.8',
  installerVersion: '1.13.4',
  isAndroidApp: false,
  isDesktopApp: true
};

let app: AppOriginal;
let openedModal: ModalBase<void> | null;

beforeEach(() => {
  vi.clearAllMocks();
  app = App.createConfigured__().asOriginalType__();
  openedModal = null;
  vi.mocked(showModal).mockImplementation((modalCreator) => {
    const modal = modalCreator(() => undefined) as ModalBase<void>;
    openedModal = modal;
    modal.onOpen();
    modal.onClose();
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

  it('should offer a download only for an installer update, which is the one the app cannot fetch itself', async () => {
    const withInstaller = await render(createResult([createStatus(ReleaseStreamId.Installer, true)]));
    expect([...withInstaller.querySelectorAll('a')].map((link) => link.textContent)).toContain('Download');

    const appOnly = await render(createResult([createStatus(ReleaseStreamId.App, true)]));
    expect([...appOnly.querySelectorAll('a')].map((link) => link.textContent)).not.toContain('Download');
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
    const contentEl = await render(createResult([createStatus(ReleaseStreamId.App, false)], { ...DESKTOP, electronVersion: '28.2.2' }));

    expect(contentEl.textContent).toContain('which some Obsidian features require');
    expect([...contentEl.querySelectorAll('a')].map((link) => link.textContent)).toContain('the download page');
  });

  it('should be absent on mobile, where there is no Electron', async () => {
    const contentEl = await render(createResult([createStatus(ReleaseStreamId.App, false)], { ...DESKTOP, electronVersion: null }));
    expect(contentEl.querySelector('.app-update-notifier-electron')).toBeNull();
  });
});

function createResult(statuses: readonly ReleaseStreamStatus[], platform: PlatformSnapshot = DESKTOP): UpdateCheckResult {
  return {
    checkedAtInMilliseconds: 1_756_000_000_000,
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

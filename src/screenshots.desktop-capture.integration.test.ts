/**
 * @file
 *
 * Produces the desktop screenshots the community-store listing needs, driving the plugin's own UI in a
 * real Obsidian and writing `images/screenshots/screenshot-desktop-N.png`.
 *
 * TWO shots, because this plugin has exactly two surfaces and padding the set with near-duplicates of
 * the same panel would tell a reader nothing:
 *
 * 1. The settings tab — every option in one panel, including the read-only row reporting Obsidian's own
 *    automatic-updates setting, which is the premise the whole plugin rests on.
 * 2. The details panel — every watched stream, what is installed against what is published, and a
 *    changelog link for each, with the status bar item that opened it visible behind.
 *
 * **Opening the settings modal takes one extra step, and without it nothing renders.** `app.setting`
 * exists from startup but its `containerEl` is NOT in the document, and `open()` returns without
 * attaching it — so the modal builds into a detached tree and the captured document stays empty. Append
 * `containerEl` to `document.body` BEFORE calling `open()` and it renders normally. Attaching afterwards
 * is too late: the default tab has already been rendered into the detached container.
 *
 * There is deliberately no "an update is available" shot. Whether anything is behind depends on what
 * Obsidian has released this week and on the version the harness happens to boot, so such a frame could
 * not be produced on demand — and a staged one would be a picture of something the plugin never did.
 */

import {
  mkdirSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import {
  captureObsidianScreenshot,
  evalInObsidian,
  labelScreenshot,
  pollInObsidian,
  readPngDimensions
} from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  beforeAll,
  describe,
  expect,
  it
} from 'vitest';

interface DetailsProbe {
  readonly changelogLinkCount: number;
  readonly statusBarText: string;
  readonly streamHeadings: string[];
}

/**
 * Obsidian's settings modal, reduced to the container `obsidian-typings` does not declare.
 */
interface SettingsModalWithContainer {
  containerEl: HTMLElement;
}

interface SettingsProbe {
  readonly settingNames: string[];
}

const WIDTH_IN_PIXELS = 1200;
const HEIGHT_IN_PIXELS = 800;

const PLUGIN_ID = 'app-update-notifier';
const STATUS_BAR_SELECTOR = '.app-update-notifier-status-bar-item';
const MODAL_SELECTOR = '.app-update-notifier-details-modal';

/*
 * The feed waiting is done from Node rather than inside a closure, for the reason
 * `update-check.cross-platform.integration.test.ts` records at length (`T796-P41`): one closure is capped
 * at ~30s by the transport, and a check on a cold instance can outlast that.
 */
const FEED_TIMEOUT_IN_MILLISECONDS = 60_000;
const POLL_INTERVAL_IN_MILLISECONDS = 1000;

const IMAGES_DIRECTORY = join(process.cwd(), 'images', 'screenshots');

beforeAll(async () => {
  await evalInObsidian({
    async callback({ app }) {
      const SETTLE_DELAY_IN_MILLISECONDS = 1000;

      app.changeTheme('obsidian');
      app.workspace.leftSplit.collapse();

      await sleep(SETTLE_DELAY_IN_MILLISECONDS);
    },
    input: {},
    vaultPath: vaultPath()
  });
});

describe('desktop store screenshots', () => {
  it('1 - every option in one panel', async () => {
    const probe = await openSettingsTab();

    expect(probe.settingNames).toContain('Check interval');
    expect(probe.settingNames).toContain('Insider builds');
    expect(probe.settingNames).toContain('Watch the installer');
    await shoot(1, 'Every option in one place, including what Obsidian itself is set to');
  });

  it('2 - what it found, and where to read about it', async () => {
    const probe = await openDetailsPanel();

    expect(probe.statusBarText).toMatch(/^Obsidian: (?:up to date|\d+ updates?)$/);
    expect(probe.streamHeadings).toContain('App');
    expect(probe.streamHeadings).toContain('Installer');
    expect(probe.changelogLinkCount).toBeGreaterThanOrEqual(probe.streamHeadings.length);
    await shoot(2, 'Every stream it watches, with a changelog link on each');
  });
});

/**
 * Waits for a real check, then opens the details panel from the status bar item the way a reader would.
 *
 * @returns What the panel rendered.
 */
async function openDetailsPanel(): Promise<DetailsProbe> {
  // Let the previous shot's capture settle: the device-metrics override it sets and clears disturbs
  // Anything opened too soon afterwards.
  await evalInObsidian({
    async callback({ app }): Promise<void> {
      const RESIZE_SETTLE_DELAY_IN_MILLISECONDS = 2000;

      app.setting.close();
      await sleep(RESIZE_SETTLE_DELAY_IN_MILLISECONDS);
    },
    input: {},
    vaultPath: vaultPath()
  });

  const statusBarText = await pollInObsidian({
    input: { statusBarSelector: STATUS_BAR_SELECTOR },
    intervalInMilliseconds: POLL_INTERVAL_IN_MILLISECONDS,
    poll({ statusBarSelector }): string {
      return document.querySelector(statusBarSelector)?.textContent ?? '';
    },
    timeoutInMilliseconds: FEED_TIMEOUT_IN_MILLISECONDS,
    timeoutMessage: 'a check never reached a real answer',
    until: (text: string): boolean => text !== '' && !text.includes('not checked'),
    vaultPath: vaultPath()
  });

  await pollInObsidian({
    input: { modalSelector: MODAL_SELECTOR, pluginId: PLUGIN_ID },
    intervalInMilliseconds: POLL_INTERVAL_IN_MILLISECONDS,
    poll({ modalSelector }): boolean {
      return document.querySelector(modalSelector) !== null;
    },
    start({ app, pluginId }): void {
      app.commands.executeCommandById(`${pluginId}:check-for-updates`);
    },
    timeoutInMilliseconds: FEED_TIMEOUT_IN_MILLISECONDS,
    timeoutMessage: 'the details panel never opened',
    until: (isModalOpen: boolean): boolean => isModalOpen,
    vaultPath: vaultPath()
  });

  return await evalInObsidian({
    async callback({ modalSelector, statusBarText: observedStatusBarText }): Promise<DetailsProbe> {
      const SETTLE_DELAY_IN_MILLISECONDS = 1500;

      await sleep(SETTLE_DELAY_IN_MILLISECONDS);

      const modalEl = document.querySelector(modalSelector);
      return {
        changelogLinkCount: [...modalEl?.querySelectorAll('a') ?? []]
          .filter((el) => (el.getAttribute('href') ?? '').startsWith('https://obsidian.md/changelog'))
          .length,
        statusBarText: observedStatusBarText,
        streamHeadings: [...modalEl?.querySelectorAll('h3') ?? []].map((el) => el.textContent)
      };
    },
    input: {
      modalSelector: MODAL_SELECTOR,
      statusBarText
    },
    vaultPath: vaultPath()
  });
}

/**
 * Opens this plugin's settings tab and reports the rows it rendered.
 *
 * @returns The names of the rendered settings.
 */
async function openSettingsTab(): Promise<SettingsProbe> {
  return await evalInObsidian({
    async callback({ app, lib: { waitUntil }, pluginId }): Promise<SettingsProbe> {
      const RENDER_TIMEOUT_IN_MILLISECONDS = 20_000;
      const OPEN_DELAY_IN_MILLISECONDS = 500;
      const SETTLE_DELAY_IN_MILLISECONDS = 1500;

      /*
       * The one step that makes this work. `app.setting.containerEl` is built at startup but never
       * attached, and `open()` does not attach it — so the modal renders into a detached tree and nothing
       * reaches the captured document. Attaching afterwards is too late: the default tab has already been
       * rendered into the detached container.
       */
      const settingsModal: unknown = app.setting;
      const containerEl = (settingsModal as SettingsModalWithContainer).containerEl;
      if (!document.body.contains(containerEl)) {
        document.body.append(containerEl);
      }

      app.setting.open();
      await sleep(OPEN_DELAY_IN_MILLISECONDS);
      app.setting.openTabById(pluginId);

      await waitUntil({
        message: 'the settings tab to render its rows',
        predicate: () =>
          [...document.querySelectorAll('.setting-item-name')]
            .some((name) => name.textContent === 'Check interval'),
        timeoutInMilliseconds: RENDER_TIMEOUT_IN_MILLISECONDS
      });

      await sleep(SETTLE_DELAY_IN_MILLISECONDS);

      return {
        settingNames: [...document.querySelectorAll('.setting-item-name')].map((name) => name.textContent)
      };
    },
    input: { pluginId: PLUGIN_ID },
    vaultPath: vaultPath()
  });
}

/**
 * Captures the window, captions it, and writes it as
 * `images/screenshots/screenshot-desktop-<index>.png`.
 *
 * @param index - The 1-based listing position.
 * @param caption - The caption drawn across the bottom of the frame.
 */
async function shoot(index: number, caption: string): Promise<void> {
  const bytes = await captureObsidianScreenshot({
    heightInPixels: HEIGHT_IN_PIXELS,
    vaultPath: vaultPath(),
    widthInPixels: WIDTH_IN_PIXELS
  });

  const labeled = await labelScreenshot(bytes, { text: caption });

  expect(readPngDimensions(labeled)).toStrictEqual({
    heightInPixels: HEIGHT_IN_PIXELS,
    widthInPixels: WIDTH_IN_PIXELS
  });

  mkdirSync(IMAGES_DIRECTORY, { recursive: true });
  writeFileSync(join(IMAGES_DIRECTORY, `screenshot-desktop-${String(index)}.png`), labeled);
}

function vaultPath(): string {
  return getTemporaryVault().path;
}

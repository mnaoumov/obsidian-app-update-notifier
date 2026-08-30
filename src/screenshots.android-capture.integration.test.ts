/**
 * @file
 *
 * Produces the mobile screenshots the community-store listing needs, driving the plugin's own UI in
 * Obsidian Mobile on a real Android emulator and writing `images/screenshots/screenshot-mobile-N.png`.
 *
 * TWO shots, the mobile half of the desktop set: the settings panel, and the details panel. The mobile
 * details panel is NOT a narrower copy of the desktop one — the installer stream does not exist on
 * mobile and is absent from it, which is worth a frame of its own.
 *
 * **Opening the settings modal takes one extra step, and without it nothing renders.** `app.setting`
 * exists from startup but its `containerEl` is NOT in the document, and `open()` returns without
 * attaching it — so the modal builds into a detached tree and the captured document stays empty. Append
 * `containerEl` to `document.body` BEFORE calling `open()`. Attaching afterwards is too late: the
 * default tab has already been rendered into the detached container.
 *
 * There is no mobile equivalent of the desktop viewport override, so the capture is always the device's
 * own framebuffer, and the AVD is built at exactly 900x1600.
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

const WIDTH_IN_PIXELS = 900;
const HEIGHT_IN_PIXELS = 1600;

const PLUGIN_ID = 'app-update-notifier';
const MODAL_SELECTOR = '.app-update-notifier-details-modal';

const IMAGES_DIRECTORY = join(process.cwd(), 'images', 'screenshots');

beforeAll(async () => {
  await evalInObsidian({
    async callback({ app }) {
      const SETTLE_DELAY_IN_MILLISECONDS = 1000;

      app.changeTheme('obsidian');

      await sleep(SETTLE_DELAY_IN_MILLISECONDS);
    },
    input: {},
    vaultPath: vaultPath()
  });
});

describe('mobile store screenshots', () => {
  it('1 - every option in one panel', async () => {
    const probe = await openSettingsTab();

    expect(probe.settingNames).toContain('Check interval');
    expect(probe.settingNames).toContain('Insider builds');
    await shoot(1, 'Every option in one place, on the phone too');
  });

  it('2 - what it found, and where to read about it', async () => {
    const probe = await openDetailsPanel();

    expect(probe.streamHeadings).toContain('App');
    // The installer is a desktop-only idea, so the mobile panel does not pretend to have one.
    expect(probe.streamHeadings).not.toContain('Installer');
    expect(probe.changelogLinkCount).toBeGreaterThanOrEqual(probe.streamHeadings.length);
    await shoot(2, 'The app stream, with a changelog link — no installer on mobile');
  });
});

/**
 * Waits for a real check, then opens the details panel through the plugin's own command.
 *
 * @returns What the panel rendered.
 */
async function openDetailsPanel(): Promise<DetailsProbe> {
  return await evalInObsidian({
    async callback({
      app,
      lib: { waitUntil },
      modalSelector,
      pluginId
    }): Promise<DetailsProbe> {
      const FEED_TIMEOUT_IN_MILLISECONDS = 90_000;
      const SETTLE_DELAY_IN_MILLISECONDS = 2000;

      app.setting.close();
      await sleep(SETTLE_DELAY_IN_MILLISECONDS);

      app.commands.executeCommandById(`${pluginId}:check-for-updates`);
      await waitUntil({
        message: 'the details panel to open',
        predicate: () => document.querySelector(modalSelector) !== null,
        timeoutInMilliseconds: FEED_TIMEOUT_IN_MILLISECONDS
      });

      await sleep(SETTLE_DELAY_IN_MILLISECONDS);

      const modalEl = document.querySelector(modalSelector);
      return {
        changelogLinkCount: [...modalEl?.querySelectorAll('a') ?? []]
          .filter((el) => (el.getAttribute('href') ?? '').startsWith('https://obsidian.md/changelog'))
          .length,
        streamHeadings: [...modalEl?.querySelectorAll('h3') ?? []].map((el) => el.textContent)
      };
    },
    input: {
      modalSelector: MODAL_SELECTOR,
      pluginId: PLUGIN_ID
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
      const RENDER_TIMEOUT_IN_MILLISECONDS = 30_000;
      const OPEN_DELAY_IN_MILLISECONDS = 500;
      const SETTLE_DELAY_IN_MILLISECONDS = 1500;

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
 * Captures the device framebuffer, captions it, and writes it as
 * `images/screenshots/screenshot-mobile-<index>.png`.
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
  writeFileSync(join(IMAGES_DIRECTORY, `screenshot-mobile-${String(index)}.png`), labeled);
}

function vaultPath(): string {
  return getTemporaryVault().path;
}

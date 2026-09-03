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
 *
 * **These shots are not byte-stable, and were never going to be.** Shot 1 is the settings panel — no
 * clock, no timestamp, nothing time-dependent in the frame — and it still came back 3 bytes different
 * between two runs of an unchanged plugin (136378 → 136381), so the churn is compression noise rather
 * than anything that could be blanked out (`T971-P41`). A capture always rewrites both PNGs; `git status`
 * is not the check, the assertions are, and a shot whose only difference is that noise should be
 * restored rather than committed.
 *
 * **There is also no version pin here, unlike the desktop half.** `scripts/vitest-config.ts` pins the
 * desktop capture's app and installer so shot 2 always shows something behind, but the Android transport
 * exposes no version knob at all — the app is whatever APK the AVD carries — and the mobile panel has no
 * installer stream to be behind in the first place. That is why the mobile shot promises only the app
 * stream with its changelog link, and asserts nothing about anything being out of date.
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
const STATUS_BAR_SELECTOR = '.app-update-notifier-status-bar-item';
const MODAL_SELECTOR = '.app-update-notifier-details-modal';
const NOTICE_SELECTOR = '.notice';

/*
 * The waiting is done from Node rather than inside a closure, for the reason
 * `update-check.cross-platform.integration.test.ts` records at length (`T796-P41`): one closure is capped
 * at ~30s by the transport, which Appium reports as a bare `script timeout`. A real check on this cold,
 * rarely-used AVD is exactly the thing that outlasts it.
 */
const FEED_TIMEOUT_IN_MILLISECONDS = 90_000;
const RENDER_TIMEOUT_IN_MILLISECONDS = 30_000;
const POLL_INTERVAL_IN_MILLISECONDS = 1000;

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
 * Clears any notice standing over the UI, immediately before a capture.
 *
 * The desktop twin needs this because its pinned installer makes the plugin's own update notice fire on
 * every run; nothing is pinned here, so whether a notice is up depends on what the AVD's Obsidian is
 * against the public feed that day. Either way a toast across the panel is not what the shot promises,
 * and whether it has faded by the time the shutter opens is exactly the luck this suite is being taken
 * out of.
 *
 * @returns A {@link Promise} that resolves once the notices are gone and the device has repainted.
 */
async function dismissNotices(): Promise<void> {
  await evalInObsidian({
    async callback({ noticeSelector }): Promise<void> {
      const REPAINT_DELAY_IN_MILLISECONDS = 500;

      for (const noticeEl of document.querySelectorAll(noticeSelector)) {
        noticeEl.remove();
      }

      await sleep(REPAINT_DELAY_IN_MILLISECONDS);
    },
    input: { noticeSelector: NOTICE_SELECTOR },
    vaultPath: vaultPath()
  });
}

/**
 * Waits for a real check, then opens the details panel through the plugin's own command.
 *
 * @returns What the panel rendered.
 */
async function openDetailsPanel(): Promise<DetailsProbe> {
  await evalInObsidian({
    async callback({ app }): Promise<void> {
      const SETTLE_DELAY_IN_MILLISECONDS = 2000;

      app.setting.close();
      await sleep(SETTLE_DELAY_IN_MILLISECONDS);
    },
    input: {},
    vaultPath: vaultPath()
  });

  /*
   * Wait for a check to reach a real answer BEFORE opening the panel. Without this the command opens a
   * panel that has nothing to render yet, and the shot is of an empty modal — which is how this suite
   * failed on a freshly booted emulator whose network had not validated (`T934-P2`). The desktop twin has
   * always waited here; the mobile one had not.
   */
  await pollInObsidian({
    input: { statusBarSelector: STATUS_BAR_SELECTOR },
    intervalInMilliseconds: POLL_INTERVAL_IN_MILLISECONDS,
    poll({ statusBarSelector }): string {
      return document.querySelector(statusBarSelector)?.textContent ?? '';
    },
    timeoutInMilliseconds: FEED_TIMEOUT_IN_MILLISECONDS,
    timeoutMessage: 'a check never reached a real answer',
    until: (statusBarText: string): boolean => statusBarText !== '' && !statusBarText.includes('not checked'),
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
    async callback({ modalSelector }): Promise<DetailsProbe> {
      const SETTLE_DELAY_IN_MILLISECONDS = 2000;

      await sleep(SETTLE_DELAY_IN_MILLISECONDS);

      const modalEl = document.querySelector(modalSelector);
      return {
        changelogLinkCount: [...modalEl?.querySelectorAll('a') ?? []]
          .filter((el) => (el.getAttribute('href') ?? '').startsWith('https://obsidian.md/changelog'))
          .length,
        streamHeadings: [...modalEl?.querySelectorAll('h3') ?? []].map((el) => el.textContent)
      };
    },
    input: { modalSelector: MODAL_SELECTOR },
    vaultPath: vaultPath()
  });
}

/**
 * Opens this plugin's settings tab and reports the rows it rendered.
 *
 * @returns The names of the rendered settings.
 */
async function openSettingsTab(): Promise<SettingsProbe> {
  await pollInObsidian({
    input: { pluginId: PLUGIN_ID },
    intervalInMilliseconds: POLL_INTERVAL_IN_MILLISECONDS,
    poll(): boolean {
      return [...document.querySelectorAll('.setting-item-name')]
        .some((name) => name.textContent === 'Check interval');
    },
    async start({ app, pluginId }): Promise<void> {
      const OPEN_DELAY_IN_MILLISECONDS = 500;

      const settingsModal: unknown = app.setting;
      const containerEl = (settingsModal as SettingsModalWithContainer).containerEl;
      if (!document.body.contains(containerEl)) {
        document.body.append(containerEl);
      }

      app.setting.open();
      await sleep(OPEN_DELAY_IN_MILLISECONDS);
      app.setting.openTabById(pluginId);
    },
    timeoutInMilliseconds: RENDER_TIMEOUT_IN_MILLISECONDS,
    timeoutMessage: 'the settings tab never rendered its rows',
    until: (areRowsRendered: boolean): boolean => areRowsRendered,
    vaultPath: vaultPath()
  });

  return await evalInObsidian({
    async callback(): Promise<SettingsProbe> {
      const SETTLE_DELAY_IN_MILLISECONDS = 1500;

      await sleep(SETTLE_DELAY_IN_MILLISECONDS);

      return {
        settingNames: [...document.querySelectorAll('.setting-item-name')].map((name) => name.textContent)
      };
    },
    input: {},
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
  await dismissNotices();

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

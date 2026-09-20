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
 * **The settings modal must be told NOT to open in its own window, or the shot is of an empty one.**
 * `app.setting` is popout-capable: its `shouldUsePopout()` returns `app.vault.getConfig('settingsPopoutWindow')`,
 * which Obsidian's own default config sets to `true` (verified in the shipped bundles of both 1.13.7 and
 * 1.14.0), and the popout branch is taken whenever `Platform.canPopoutWindow` — `isDesktopApp && isDesktop`,
 * so on every desktop and no mobile. That branch creates a real second Electron window, reassigns the
 * `activeWindow` / `activeDocument` globals to it, and the base `Modal.open()` then appends `getRootEl()`
 * — `modalEl` for a popout — into THAT window's document. Measured 2026-09-03: the main
 * document was left holding three `.setting-item-name` rows, all of them the search sidebar's, so a wait
 * for `Check interval` could only ever time out. `setConfig('settingsPopoutWindow', false)` before
 * `open()` keeps the modal in the window `captureObsidianScreenshot` actually photographs.
 *
 * A settings test that only asserts can dodge this by querying `settingTab.containerEl` — an object
 * reference, wherever it lives — the way `obsidian-advanced-note-composer`'s
 * `settings-page-navigation.desktop.integration.test.ts` does. A screenshot cannot: the capture is of the
 * main window, so a popout produces a frame with no settings in it and no error to say so.
 *
 * **`open()` attaches `containerEl` itself**, once the popout is off — measured in the same run, which
 * went from `document.body.contains(containerEl) === false` before the call to `true` after it, with
 * `modalEl` inside. An earlier version of this file pre-appended `containerEl` to `document.body` on the
 * premise that `open()` returns without attaching; that premise does not hold for the Obsidian this
 * harness provisions, and the pre-append is gone with it.
 *
 * **Shot 2's content is PINNED, not observed.** Whether anything is behind depends on what Obsidian has
 * released this week and on the version the harness happens to boot, and left to chance the shot silently
 * degrades: the 2026-09-03 recapture ran against the Catalyst `obsidian-1.14.0.asar` the harness now
 * provisions and rendered `App Installed: 1.14.0 / Latest: 1.13.7 / Up to date.` — correct reporting
 * against the public feed the plugin watches, but a version pair that reads as nonsense to a store
 * visitor, with nothing behind and so no action links at all. `scripts/vitest-config.ts`
 * therefore pins this project's app to `public-latest` and its installer to `1.13.4`, which produces the
 * app-current / installer-behind frame on any day, because `Latest` only ever moves up. Nothing is staged:
 * the plugin is photographed doing exactly what it does on a machine whose installer is behind, which is
 * the machine this plugin exists for. The `it` below ASSERTS that frame, so a run against a drifted or
 * unpinned pair fails the capture rather than overwriting a committed shot with a worse one.
 *
 * **A capture ALWAYS rewrites all four PNGs, so `git status` is not the check.** The panel prints a real
 * `Last checked <wall clock>` and the frames carry compression noise regardless — mobile shot 1 moved by
 * three bytes with no clock anywhere in it — so byte-stability was never on the table and a byte diff is
 * not signal. The assertions here are the check; judge a recapture on what the frame SHOWS, and restore
 * any shot whose only difference is the clock or the noise.
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
  readonly actionLinkTexts: string[];
  readonly changelogLinkCount: number;
  readonly statusBarText: string;
  readonly streams: StreamProbe[];
}

interface SettingsProbe {
  readonly settingNames: string[];
}

/**
 * One rendered stream section: its heading, and the sentence `describeStatus` put under the two versions.
 */
interface StreamProbe {
  readonly heading: string;
  readonly summary: string;
}

/**
 * Obsidian's vault config, reduced to the one key `obsidian-typings` does not declare. Its `ConfigItem`
 * union lists fifty keys and `settingsPopoutWindow` is not among them, so the call needs a cast until it
 * is.
 */
interface VaultWithPopoutConfig {
  setConfig: (key: 'settingsPopoutWindow', shouldUsePopout: boolean) => void;
}

const WIDTH_IN_PIXELS = 1200;
const HEIGHT_IN_PIXELS = 800;

const PLUGIN_ID = 'app-update-notifier';
const STATUS_BAR_SELECTOR = '.app-update-notifier-status-bar-item';
const MODAL_SELECTOR = '.app-update-notifier-details-modal';
const STREAM_SELECTOR = '.app-update-notifier-stream';
const NOTICE_SELECTOR = '.notice';

const APP_STREAM_HEADING = 'App';
const INSTALLER_STREAM_HEADING = 'Installer';
const UPDATE_AVAILABLE_SUMMARY = 'An update is available.';
const UP_TO_DATE_SUMMARY = 'Up to date.';
const NEW_INSTALLER_LINK_TEXT = 'Update with new installer (recommended)';

/*
 * The feed waiting is done from Node rather than inside a closure, for the reason
 * `update-check.cross-platform.integration.test.ts` records at length: one closure is capped
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

    const headings = probe.streams.map((stream) => stream.heading);

    expect(probe.statusBarText).toMatch(/^Obsidian: (?:up to date|\d+ updates?)$/);
    expect(headings).toContain(APP_STREAM_HEADING);
    expect(headings).toContain(INSTALLER_STREAM_HEADING);
    expect(probe.changelogLinkCount).toBeGreaterThanOrEqual(headings.length);

    /*
     * The frame this shot exists for, and the reason the project pins its versions: the app current, the
     * installer behind, and the route out of it. Asserted rather than hoped for — every assertion above
     * passed on the degraded 2026-09-03 frame, which is how a worse shot came within one `git add` of
     * replacing a good one.
     */
    expect(summaryOf(probe, APP_STREAM_HEADING)).toContain(UP_TO_DATE_SUMMARY);
    expect(summaryOf(probe, INSTALLER_STREAM_HEADING)).toContain(UPDATE_AVAILABLE_SUMMARY);
    expect(probe.actionLinkTexts).toContain(NEW_INSTALLER_LINK_TEXT);

    await shoot(2, 'Every stream it watches, with a changelog link on each');
  });
});

/**
 * Clears any notice standing over the UI, immediately before a capture.
 *
 * Not cosmetic tidying — pinning the installer behind (see the file header) means the plugin's own
 * "a newer Obsidian installer is available" notice fires on EVERY capture run, and it is large enough to
 * cover the `Check interval` control and the settings modal's close button in the top right. The first
 * pinned run photographed exactly that. Whether it is still up when the shutter opens depends on notice
 * timing against the settle delays, which is the same kind of luck this whole suite is being pinned away
 * from, so it is removed rather than waited out.
 *
 * @returns A {@link Promise} that resolves once the notices are gone and the window has repainted.
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
 * Waits for a real check, then opens the details panel from the status bar item the way a reader would.
 *
 * @returns What the panel rendered.
 */
async function openDetailsPanel(): Promise<DetailsProbe> {
  // Let the previous shot's capture settle: the device-metrics override it sets and clears disturbs
  // anything opened too soon afterwards.
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
    async callback({ modalSelector, statusBarText: observedStatusBarText, streamSelector }): Promise<DetailsProbe> {
      const SETTLE_DELAY_IN_MILLISECONDS = 1500;

      await sleep(SETTLE_DELAY_IN_MILLISECONDS);

      const modalEl = document.querySelector(modalSelector);
      const streamEls = [...modalEl?.querySelectorAll(streamSelector) ?? []];
      return {
        /*
         * Only the links INSIDE a stream section, which is where `appendUpdateActions` renders the update
         * routes; the panel's other anchors (the Electron span, the download page) are not routes.
         */
        actionLinkTexts: streamEls.flatMap((streamEl) => [...streamEl.querySelectorAll('a')].map((el) => el.textContent)),
        changelogLinkCount: [...modalEl?.querySelectorAll('a') ?? []]
          .filter((el) => (el.getAttribute('href') ?? '').startsWith('https://obsidian.md/changelog'))
          .length,
        statusBarText: observedStatusBarText,
        streams: streamEls.map((streamEl) => ({
          heading: streamEl.querySelector('h3')?.textContent ?? '',
          // The first paragraph is the one carrying both versions and `describeStatus`'s verdict.
          summary: streamEl.querySelector('p')?.textContent ?? ''
        }))
      };
    },
    input: {
      modalSelector: MODAL_SELECTOR,
      statusBarText,
      streamSelector: STREAM_SELECTOR
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
       * The one step that makes this work, and it must come BEFORE `open()` — `shouldUsePopout()` is read
       * inside the call. Left at Obsidian's default the settings go into a second Electron window, taking
       * `activeWindow` / `activeDocument` with them, and this document never sees a row. The file header
       * records the mechanism and what was measured.
       */
      const vault: unknown = app.vault;
      (vault as VaultWithPopoutConfig).setConfig('settingsPopoutWindow', false);

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
  writeFileSync(join(IMAGES_DIRECTORY, `screenshot-desktop-${String(index)}.png`), labeled);
}

/**
 * Reads back what one stream section said about itself.
 *
 * @param probe - What the panel rendered.
 * @param heading - The stream's heading, e.g. `App`.
 * @returns The stream's first paragraph, or the empty string when the panel rendered no such stream —
 * which fails the caller's `toContain` and names the missing stream in the diff.
 */
function summaryOf(probe: DetailsProbe, heading: string): string {
  return probe.streams.find((stream) => stream.heading === heading)?.summary ?? '';
}

function vaultPath(): string {
  return getTemporaryVault().path;
}

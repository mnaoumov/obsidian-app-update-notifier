import { evalInObsidian } from 'obsidian-integration-testing';
import {
  describe,
  expect,
  it
} from 'vitest';

/*
 * The half of the plugin that behaves the same everywhere, driven end to end against a real Obsidian and
 * the real public feeds: a check runs, the status bar item stops saying "not checked" and starts
 * reporting a real answer, and the details panel names the app stream with somewhere to read.
 *
 * Cross-platform because the app stream exists on both, and because the way it is RESOLVED differs —
 * `desktop-releases.json` on desktop, the newest release carrying an `.apk` on Android. Running the same
 * assertions on both is what proves the second path works; the desktop-only installer half lives in
 * `installer-stream.desktop.integration.test.ts`.
 *
 * Nothing below asserts a particular Obsidian version. Which versions are current changes every few
 * weeks, and a test that pinned them would fail for the wrong reason; what matters is that the plugin
 * reaches a real answer at all, and that the answer is one of the two it is allowed to give.
 */

const PLUGIN_ID = 'app-update-notifier';
const STATUS_BAR_SELECTOR = '.app-update-notifier-status-bar-item';
const MODAL_SELECTOR = '.app-update-notifier-details-modal';

interface UpdateCheckObservations {
  readonly appChangelogUrl: string;
  readonly appLatestVersion: string;
  readonly isDesktopApp: boolean;
  readonly isPluginLoaded: boolean;
  readonly statusBarText: string;
  readonly streamHeadings: string[];
}

describe('A real check against the real feeds', () => {
  it('reaches a real answer and names the app stream with a changelog link', async () => {
    const observations = await evalInObsidian({
      async callback({
        app,
        lib: { waitUntil },
        modalSelector,
        obsidianModule,
        pluginId,
        statusBarSelector
      }): Promise<UpdateCheckObservations> {
        const FEED_TIMEOUT_IN_MILLISECONDS = 90_000;
        const UI_TIMEOUT_IN_MILLISECONDS = 30_000;

        const isPluginLoaded = Object.hasOwn(app.plugins.plugins, pluginId);

        await waitUntil({
          message: 'the status bar item to be created',
          predicate: () => document.querySelector(statusBarSelector) !== null,
          timeoutInMilliseconds: UI_TIMEOUT_IN_MILLISECONDS
        });

        /*
         * The plugin checks once the layout is ready, so the item is created saying "not checked" and
         * then rewritten. Waiting for the text to stop saying that is what proves a real check reached
         * a real answer, rather than that an element merely exists.
         */
        await waitUntil({
          message: 'a check to reach a real answer',
          predicate: () => !(document.querySelector(statusBarSelector)?.textContent ?? '').includes('not checked'),
          timeoutInMilliseconds: FEED_TIMEOUT_IN_MILLISECONDS
        });

        const statusBarText = document.querySelector(statusBarSelector)?.textContent ?? '';

        app.commands.executeCommandById(`${pluginId}:check-for-updates`);
        await waitUntil({
          message: 'the details panel to open',
          predicate: () => document.querySelector(modalSelector) !== null,
          timeoutInMilliseconds: FEED_TIMEOUT_IN_MILLISECONDS
        });

        const modalEl = document.querySelector(modalSelector);
        const streamEls = [...modalEl?.querySelectorAll('.app-update-notifier-stream') ?? []];
        const appStreamEl = streamEls.find((el) => el.querySelector('h3')?.textContent === 'App');

        // The versions are separated by <br>, which contributes no newline to `textContent`, so the
        // Whole block is matched rather than split into lines.
        const latestMatch = /Latest:\s*(?<version>[\d.]+)/.exec(appStreamEl?.textContent ?? '');

        const observed: UpdateCheckObservations = {
          appChangelogUrl: appStreamEl?.querySelector('a')?.getAttribute('href') ?? '',
          appLatestVersion: latestMatch?.groups?.['version'] ?? '',
          isDesktopApp: obsidianModule.Platform.isDesktopApp,
          isPluginLoaded,
          statusBarText,
          streamHeadings: streamEls.map((el) => el.querySelector('h3')?.textContent ?? '')
        };

        for (const closeEl of document.querySelectorAll('.modal-close-button')) {
          (closeEl as HTMLElement).click();
        }

        return observed;
      },
      input: {
        modalSelector: MODAL_SELECTOR,
        pluginId: PLUGIN_ID,
        statusBarSelector: STATUS_BAR_SELECTOR
      }
    });

    expect(observations.isPluginLoaded).toBe(true);

    // One of the two answers a successful check is allowed to give — never "not checked", which is what
    // The item says when nothing has succeeded.
    expect(observations.statusBarText).toMatch(/^Obsidian: (?:up to date|\d+ updates?)$/);

    // The app stream applies on every platform this plugin runs on.
    expect(observations.streamHeadings).toContain('App');

    // A real version resolved from a real feed, whichever feed this platform reads.
    expect(observations.appLatestVersion).toMatch(/^\d+\.\d+\.\d+$/);

    // Somewhere to read. A notification without that is not worth showing.
    expect(observations.appChangelogUrl).toMatch(/^https:\/\/obsidian\.md\/changelog/);

    /*
     * The platform rule, asserted in BOTH directions from one run: the installer is a desktop-only idea,
     * so its row must be present on desktop and absent on Android. Asserting only the desktop half would
     * let the mobile path start reporting a meaningless installer version with nothing noticing.
     */
    expect(observations.streamHeadings.includes('Installer')).toBe(observations.isDesktopApp);
  });
});

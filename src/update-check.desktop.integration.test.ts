import { evalInObsidian } from 'obsidian-integration-testing';
import {
  describe,
  expect,
  it
} from 'vitest';

/*
 * The plugin's whole reason to exist, driven end to end against a real Obsidian and the real public
 * feeds: a check runs, the status bar item stops saying "not checked" and starts reporting a real
 * answer, and clicking it opens a panel that names each watched stream with a changelog link.
 *
 * Nothing below asserts a particular Obsidian version. Which versions are current changes every few
 * weeks, and a test that pinned them would fail for the wrong reason; what matters is that the plugin
 * reaches a real answer at all, and that the answer is one of the two it is allowed to give.
 */

const PLUGIN_ID = 'app-update-notifier';
const STATUS_BAR_SELECTOR = '.app-update-notifier-status-bar-item';
const MODAL_SELECTOR = '.app-update-notifier-details-modal';

interface UpdateCheckObservations {
  readonly changelogUrls: string[];
  readonly isPluginLoaded: boolean;
  readonly statusBarText: string;
  readonly streamHeadings: string[];
}

describe('A real check against the real feeds', () => {
  it('populates the status bar and the details panel', async () => {
    const observations = await evalInObsidian({
      async callback({
        app,
        lib: { waitUntil },
        modalSelector,
        pluginId,
        statusBarSelector
      }): Promise<UpdateCheckObservations> {
        const FEED_TIMEOUT_IN_MILLISECONDS = 60_000;
        const UI_TIMEOUT_IN_MILLISECONDS = 10_000;

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
          message: 'the details modal to open',
          predicate: () => document.querySelector(modalSelector) !== null,
          timeoutInMilliseconds: FEED_TIMEOUT_IN_MILLISECONDS
        });

        const modalEl = document.querySelector(modalSelector);
        const streamHeadings = [...modalEl?.querySelectorAll('h3') ?? []].map((el) => el.textContent);
        const changelogUrls = [...modalEl?.querySelectorAll('a') ?? []]
          .map((el) => el.getAttribute('href') ?? '')
          .filter((href) => href.startsWith('https://obsidian.md/changelog'));

        for (const closeEl of document.querySelectorAll('.modal-close-button')) {
          (closeEl as HTMLElement).click();
        }

        return {
          changelogUrls,
          isPluginLoaded,
          statusBarText,
          streamHeadings
        };
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

    // The app stream always applies; the installer stream applies because this is desktop. The insider
    // Stream follows Obsidian's own setting, which a fresh instance has off, so it is deliberately not
    // Required here.
    expect(observations.streamHeadings).toContain('App');
    expect(observations.streamHeadings).toContain('Installer');

    // Every stream carries somewhere to read. A notification without that is not worth showing.
    expect(observations.changelogUrls.length).toBeGreaterThanOrEqual(observations.streamHeadings.length);
  });
});

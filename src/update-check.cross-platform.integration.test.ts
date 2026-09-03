import {
  evalInObsidian,
  pollInObsidian
} from 'obsidian-integration-testing';
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
 *
 * THE WAITING HAPPENS IN NODE, not inside Obsidian (`T796-P41`). A single `evalInObsidian` closure is
 * capped at ~30s by the transport — Appium surfaces it as a bare `script timeout`, CDP as a command
 * timeout — so a closure that waits on a feed is a closure that dies on any machine where the feed is
 * slower than that. Waiting on the emulator's user-mode NAT is exactly that machine. Each closure below is
 * therefore milliseconds of DOM reading, and `pollInObsidian` runs it repeatedly from Node until the
 * Node-side `until` accepts.
 */

const PLUGIN_ID = 'app-update-notifier';
const STATUS_BAR_SELECTOR = '.app-update-notifier-status-bar-item';
const MODAL_SELECTOR = '.app-update-notifier-details-modal';

const FEED_TIMEOUT_IN_MILLISECONDS = 90_000;
const POLL_INTERVAL_IN_MILLISECONDS = 1000;

interface CheckProbe {
  readonly isPluginLoaded: boolean;
  readonly statusBarText: string;
}

interface PanelObservations {
  readonly appChangelogUrl: string;
  readonly appLatestVersion: string;
  readonly isDesktopApp: boolean;
  readonly streamHeadings: string[];
}

interface PanelProbe {
  readonly isModalOpen: boolean;
  readonly observations: null | PanelObservations;
}

describe('A real check against the real feeds', () => {
  it('reaches a real answer and names the app stream with a changelog link', async () => {
    /*
     * The plugin checks once the layout is ready, so the item is created saying "not checked" and then
     * rewritten. Polling until the text stops saying that is what proves a real check reached a real
     * answer, rather than that an element merely exists — an absent item reads as `''` and is rejected
     * by the same predicate.
     */
    const check = await pollInObsidian({
      input: {
        pluginId: PLUGIN_ID,
        statusBarSelector: STATUS_BAR_SELECTOR
      },
      intervalInMilliseconds: POLL_INTERVAL_IN_MILLISECONDS,
      poll({
        app,
        pluginId,
        statusBarSelector
      }): CheckProbe {
        return {
          isPluginLoaded: Object.hasOwn(app.plugins.plugins, pluginId),
          statusBarText: document.querySelector(statusBarSelector)?.textContent ?? ''
        };
      },
      timeoutInMilliseconds: FEED_TIMEOUT_IN_MILLISECONDS,
      timeoutMessage: 'a check never reached a real answer',
      until: (probe: CheckProbe): boolean => probe.statusBarText !== '' && !probe.statusBarText.includes('not checked')
    });

    const panel = await pollInObsidian({
      input: {
        modalSelector: MODAL_SELECTOR,
        pluginId: PLUGIN_ID
      },
      intervalInMilliseconds: POLL_INTERVAL_IN_MILLISECONDS,
      poll({
        modalSelector,
        obsidianModule
      }): PanelProbe {
        const modalEl = document.querySelector(modalSelector);
        if (!modalEl) {
          return {
            isModalOpen: false,
            observations: null
          };
        }

        const streamEls = [...modalEl.querySelectorAll('.app-update-notifier-stream')];
        const appStreamEl = streamEls.find((el) => el.querySelector('h3')?.textContent === 'App');

        // The versions are separated by <br>, which contributes no newline to `textContent`, so the
        // Whole block is matched rather than split into lines.
        const latestMatch = /Latest:\s*(?<version>[\d.]+)/.exec(appStreamEl?.textContent ?? '');

        return {
          isModalOpen: true,
          observations: {
            appChangelogUrl: appStreamEl?.querySelector('a')?.getAttribute('href') ?? '',
            appLatestVersion: latestMatch?.groups?.['version'] ?? '',
            isDesktopApp: obsidianModule.Platform.isDesktopApp,
            streamHeadings: streamEls.map((el) => el.querySelector('h3')?.textContent ?? '')
          }
        };
      },
      start({
        app,
        pluginId
      }): void {
        app.commands.executeCommandById(`${pluginId}:check-for-updates`);
      },
      timeoutInMilliseconds: FEED_TIMEOUT_IN_MILLISECONDS,
      timeoutMessage: 'the details panel never opened',
      until: (probe: PanelProbe): boolean => probe.isModalOpen
    });

    await evalInObsidian({
      callback(): void {
        for (const closeEl of document.querySelectorAll('.modal-close-button')) {
          (closeEl as HTMLElement).click();
        }
      },
      input: {}
    });

    expect(check.isPluginLoaded).toBe(true);

    // One of the two answers a successful check is allowed to give — never "not checked", which is what
    // The item says when nothing has succeeded.
    expect(check.statusBarText).toMatch(/^Obsidian: (?:up to date|\d+ updates?)$/);

    const observations = panel.observations;
    expect(observations).not.toBeNull();

    // The app stream applies on every platform this plugin runs on.
    expect(observations?.streamHeadings).toContain('App');

    // A real version resolved from a real feed, whichever feed this platform reads.
    expect(observations?.appLatestVersion).toMatch(/^\d+\.\d+\.\d+$/);

    // Somewhere to read. A notification without that is not worth showing.
    expect(observations?.appChangelogUrl).toMatch(/^https:\/\/obsidian\.md\/changelog/);

    /*
     * The platform rule, asserted in BOTH directions from one run: the installer is a desktop-only idea,
     * so its row must be present on desktop and absent on Android. Asserting only the desktop half would
     * let the mobile path start reporting a meaningless installer version with nothing noticing.
     */
    expect(observations?.streamHeadings.includes('Installer')).toBe(observations?.isDesktopApp);
  });
});

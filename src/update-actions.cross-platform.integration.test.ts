import { evalInObsidian } from 'obsidian-integration-testing';
import {
  describe,
  expect,
  it
} from 'vitest';

/*
 * The routes a notice offers, driven end to end against a real Obsidian and the real public feeds: a
 * check runs, the details panel opens, and every row that reports an update carries the two ways to take
 * it — replace the installer, or let Obsidian replace the app bundle alone.
 *
 * Cross-platform because both routes apply on both: the download page is platform-aware (`?os=` /
 * `?arch=`) rather than desktop-only, and Android reaches Obsidian's update check through the same
 * settings path.
 *
 * WHAT IS AND IS NOT ASSERTED, and why. Whether this machine's Obsidian actually has an update waiting
 * depends on how the harness provisioned it, so — as in the sibling suites — no particular version is
 * asserted. What IS asserted is the INVARIANT, in both directions from one run: a row that says an
 * update is available carries the routes, and a row that says it is up to date carries none. That holds
 * whichever side of the fence this machine falls on, and it is what would break if the routes were
 * rendered unconditionally or dropped entirely.
 *
 * The Electron span is deliberately NOT asserted. Its target version comes from the metadata feed's
 * `runtimeVersions`, which is absent for every current Obsidian (`T717-P2`), so there is nothing real to
 * observe yet — asserting its absence would only pin the data gap in place. Its branches are covered by
 * the fixture-driven unit tests in `update-details-modal.test.ts` and `electron-span.test.ts`.
 */

const PLUGIN_ID = 'app-update-notifier';
const MODAL_SELECTOR = '.app-update-notifier-details-modal';
const STATUS_BAR_SELECTOR = '.app-update-notifier-status-bar-item';

interface StreamObservation {
  readonly actionLinkTexts: string[];
  readonly actionsText: string;
  readonly hasActions: boolean;
  readonly heading: string;
  readonly isUpdateAvailable: boolean;
}

interface UpdateActionsObservations {
  readonly downloadUrls: string[];
  readonly isDesktopApp: boolean;
  readonly streams: StreamObservation[];
}

describe('The routes offered for a real update', () => {
  it('offers both install routes on every row reporting an update, and none on a row that is up to date', async () => {
    const observations = await evalInObsidian({
      async callback({
        app,
        lib: { waitUntil },
        modalSelector,
        obsidianModule,
        pluginId,
        statusBarSelector
      }): Promise<UpdateActionsObservations> {
        const FEED_TIMEOUT_IN_MILLISECONDS = 90_000;

        await waitUntil({
          message: 'a check to reach a real answer',
          predicate: () => {
            const text = document.querySelector(statusBarSelector)?.textContent ?? '';
            return text !== '' && !text.includes('not checked');
          },
          timeoutInMilliseconds: FEED_TIMEOUT_IN_MILLISECONDS
        });

        app.commands.executeCommandById(`${pluginId}:check-for-updates`);
        await waitUntil({
          message: 'the details panel to open',
          predicate: () => document.querySelector(modalSelector) !== null,
          timeoutInMilliseconds: FEED_TIMEOUT_IN_MILLISECONDS
        });

        const modalEl = document.querySelector(modalSelector);
        const streamEls = [...modalEl?.querySelectorAll(':scope .app-update-notifier-stream') ?? []];

        const streams = streamEls.map((streamEl): StreamObservation => {
          const actionsEl = streamEl.querySelector(':scope .app-update-notifier-actions');
          return {
            actionLinkTexts: [...actionsEl?.querySelectorAll(':scope a') ?? []].map((linkEl) => linkEl.textContent),
            actionsText: actionsEl?.textContent ?? '',
            hasActions: actionsEl !== null,
            heading: streamEl.querySelector(':scope h3')?.textContent ?? '',
            isUpdateAvailable: streamEl.textContent.includes('An update is available.')
          };
        });

        const downloadUrls = [...modalEl?.querySelectorAll(':scope a') ?? []]
          .map((linkEl) => linkEl.getAttribute('href') ?? '')
          .filter((href) => href.startsWith('https://obsidian.md/download'));

        const observed: UpdateActionsObservations = {
          downloadUrls,
          isDesktopApp: obsidianModule.Platform.isDesktopApp,
          streams
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

    // A real check reached a real answer and the panel listed at least the app stream.
    expect(observations.streams.length).toBeGreaterThan(0);

    for (const stream of observations.streams) {
      // The invariant, in both directions: routes exactly where there is something to act on.
      expect(stream.hasActions).toBe(stream.isUpdateAvailable);

      if (!stream.isUpdateAvailable) {
        continue;
      }

      /*
       * The insider toggle is off in the harness — it owns a throwaway Obsidian with no Catalyst
       * license — so the Beta row must reach the license gate and NEVER the install route. Obsidian
       * forces the toggle off when there is no license (`app.js:202195-202197`), which is the one
       * direction of that read this plugin is allowed to trust.
       */
      if (stream.heading === 'Insider build') {
        expect(stream.actionsText).toContain('needs a Catalyst license');
        expect(stream.actionLinkTexts).toEqual(['Read about Catalyst and early access']);
        continue;
      }

      expect(stream.actionLinkTexts).toContain('Update with new installer (recommended)');
      // A path rather than a button: the app's own Check for updates is wired to a module-private
      // Updater, reachable only by matching localized button text in the DOM.
      expect(stream.actionsText).toContain('Settings → General → Check for updates');
    }

    /*
     * Every download link the panel offers is the platform-aware one Obsidian's own "installer version
     * too low" recommendation builds (`app.js:61875-61886`) — never the bare download page, which would
     * make the reader pick their own OS.
     */
    for (const downloadUrl of observations.downloadUrls) {
      expect(downloadUrl).toMatch(observations.isDesktopApp ? /[?&]os=(?:win|mac|linux)&arch=/ : /[?&]os=(?:android|ios)/);
    }
  });
});

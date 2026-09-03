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
 * The half of the plugin that only exists on desktop: the installer stream, and the Electron version it
 * carries.
 *
 * Desktop-only rather than cross-platform because the distinction it reports does not exist on mobile —
 * there is no installer version there, `Platform.build` is empty, and the panel deliberately shows no
 * Installer row. That the row is ABSENT on Android is asserted by the cross-platform half, which checks
 * the rule in both directions from one run; what is asserted here is that where the row DOES apply it is
 * present and fully populated.
 *
 * Nothing below asserts a particular version. Whether this machine's installer happens to be behind
 * depends on how it was provisioned, so only the shape of the answer is checked.
 *
 * The feed waiting is done from Node rather than inside a closure, for the reason
 * `update-check.cross-platform.integration.test.ts` records at length (`T796-P41`): one closure is capped
 * at ~30s by the transport. Desktop is fast enough today that this suite passed anyway; it is converted
 * so a slow feed day fails it as a real timeout rather than as a bare command timeout.
 */

const PLUGIN_ID = 'app-update-notifier';
const MODAL_SELECTOR = '.app-update-notifier-details-modal';
const STATUS_BAR_SELECTOR = '.app-update-notifier-status-bar-item';

const FEED_TIMEOUT_IN_MILLISECONDS = 90_000;
const POLL_INTERVAL_IN_MILLISECONDS = 1000;

interface InstallerStreamObservations {
  readonly changelogUrl: string;
  readonly electronText: string;
  readonly installedVersion: string;
  readonly latestVersion: string;
  readonly streamHeadings: string[];
}

interface PanelProbe {
  readonly isModalOpen: boolean;
  readonly observations: InstallerStreamObservations | null;
}

describe('The installer stream on desktop', () => {
  it('reports the installed executable against the newest one that shipped a desktop installer', async () => {
    await pollInObsidian({
      input: { statusBarSelector: STATUS_BAR_SELECTOR },
      intervalInMilliseconds: POLL_INTERVAL_IN_MILLISECONDS,
      poll({ statusBarSelector }): string {
        return document.querySelector(statusBarSelector)?.textContent ?? '';
      },
      timeoutInMilliseconds: FEED_TIMEOUT_IN_MILLISECONDS,
      timeoutMessage: 'a check never reached a real answer',
      until: (statusBarText: string): boolean => statusBarText !== '' && !statusBarText.includes('not checked')
    });

    const panel = await pollInObsidian({
      input: {
        modalSelector: MODAL_SELECTOR,
        pluginId: PLUGIN_ID
      },
      intervalInMilliseconds: POLL_INTERVAL_IN_MILLISECONDS,
      poll({ modalSelector }): PanelProbe {
        const modalEl = document.querySelector(modalSelector);
        if (!modalEl) {
          return {
            isModalOpen: false,
            observations: null
          };
        }

        const streamEls = [...modalEl.querySelectorAll('.app-update-notifier-stream')];
        const installerEl = streamEls.find((el) => el.querySelector('h3')?.textContent === 'Installer');

        // The versions are separated by <br>, which contributes no newline to `textContent`, so each
        // Label is matched within the whole block rather than found as its own line.
        function readVersion(label: string): string {
          const pattern = new RegExp(`${label}:${String.raw`\s*(?<version>[\d.]+)`}`);
          return pattern.exec(installerEl?.textContent ?? '')?.groups?.['version'] ?? '';
        }

        return {
          isModalOpen: true,
          observations: {
            changelogUrl: installerEl?.querySelector('a')?.getAttribute('href') ?? '',
            electronText: modalEl.querySelector('.app-update-notifier-electron')?.textContent ?? '',
            installedVersion: readVersion('Installed'),
            latestVersion: readVersion('Latest'),
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

    const observations = panel.observations;
    expect(observations).not.toBeNull();

    expect(observations?.streamHeadings).toContain('Installer');

    // Both sides of the comparison resolved: `Platform.build` on one, the newest release carrying a
    // Desktop installer asset on the other.
    expect(observations?.installedVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(observations?.latestVersion).toMatch(/^\d+\.\d+\.\d+$/);

    expect(observations?.changelogUrl).toMatch(/^https:\/\/obsidian\.md\/changelog/);

    // Electron is reported on desktop, and is the version the feature gate is actually measured against.
    expect(observations?.electronText).toMatch(/Electron: \d+\.\d+\.\d+/);
  });
});

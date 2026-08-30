import { evalInObsidian } from 'obsidian-integration-testing';
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
 */

const PLUGIN_ID = 'app-update-notifier';
const MODAL_SELECTOR = '.app-update-notifier-details-modal';
const STATUS_BAR_SELECTOR = '.app-update-notifier-status-bar-item';

interface InstallerStreamObservations {
  readonly changelogUrl: string;
  readonly electronText: string;
  readonly installedVersion: string;
  readonly latestVersion: string;
  readonly streamHeadings: string[];
}

describe('The installer stream on desktop', () => {
  it('reports the installed executable against the newest one that shipped a desktop installer', async () => {
    const observations = await evalInObsidian({
      async callback({
        app,
        lib: { waitUntil },
        modalSelector,
        pluginId,
        statusBarSelector
      }): Promise<InstallerStreamObservations> {
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
        const streamEls = [...modalEl?.querySelectorAll('.app-update-notifier-stream') ?? []];
        const installerEl = streamEls.find((el) => el.querySelector('h3')?.textContent === 'Installer');

        // The versions are separated by <br>, which contributes no newline to `textContent`, so each
        // Label is matched within the whole block rather than found as its own line.
        function readVersion(label: string): string {
          const pattern = new RegExp(`${label}:${String.raw`\s*(?<version>[\d.]+)`}`);
          return pattern.exec(installerEl?.textContent ?? '')?.groups?.['version'] ?? '';
        }

        const observed: InstallerStreamObservations = {
          changelogUrl: installerEl?.querySelector('a')?.getAttribute('href') ?? '',
          electronText: modalEl?.querySelector('.app-update-notifier-electron')?.textContent ?? '',
          installedVersion: readVersion('Installed'),
          latestVersion: readVersion('Latest'),
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

    expect(observations.streamHeadings).toContain('Installer');

    // Both sides of the comparison resolved: `Platform.build` on one, the newest release carrying a
    // Desktop installer asset on the other.
    expect(observations.installedVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(observations.latestVersion).toMatch(/^\d+\.\d+\.\d+$/);

    expect(observations.changelogUrl).toMatch(/^https:\/\/obsidian\.md\/changelog/);

    // Electron is reported on desktop, and is the version the feature gate is actually measured against.
    expect(observations.electronText).toMatch(/Electron: \d+\.\d+\.\d+/);
  });
});

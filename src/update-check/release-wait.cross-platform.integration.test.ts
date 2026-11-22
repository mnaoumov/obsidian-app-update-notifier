import {
  evalInObsidian,
  pollInObsidian
} from 'obsidian-integration-testing';
import {
  afterEach,
  describe,
  expect,
  it
} from 'vitest';

/*
 * The release wait, end to end against a real Obsidian and the real feeds: with a wait long enough to
 * cover every release ever published, nothing may be counted in the status bar, and every update the
 * panel lists must carry the line saying when its wait ends.
 *
 * Nothing below asserts that an update EXISTS. Whether this machine's app or installer is behind depends
 * on how the harness provisioned it, so the assertion is the rule that has to hold either way: each
 * listed update is marked as waiting, one for one, and the item reads "up to date". Where something is
 * behind, which the pinned old installer of the screenshot run guarantees on desktop, that is a real
 * hold; where nothing is, the panel must simply show no waiting line.
 *
 * The setting is changed through the plugin's own settings component, the same live `editAndSave` the
 * settings tab calls; the wait itself is what is under test, not the dropdown that sets it.
 *
 * The waiting happens in Node, for the reason `update-check.cross-platform.integration.test.ts` records:
 * one closure is capped at ~30s by the transport.
 */

const PLUGIN_ID = 'app-update-notifier';
const MODAL_SELECTOR = '.app-update-notifier-details-modal';
const STATUS_BAR_SELECTOR = '.app-update-notifier-status-bar-item';

/**
 * A century. Every real release is inside it, and the validator accepts any whole number of days.
 */
const RELEASE_WAIT_COVERING_EVERY_RELEASE_IN_DAYS = 36_500;

const FEED_TIMEOUT_IN_MILLISECONDS = 90_000;
const POLL_INTERVAL_IN_MILLISECONDS = 1000;

/**
 * The one member of the plugin's settings component this suite drives.
 */
interface EditableSettingsComponent {
  readonly editAndSave: (editor: (settings: SettingsWithReleaseWait) => void) => Promise<void>;
}

interface PanelProbe {
  readonly availableCount: number;
  readonly isModalOpen: boolean;
  readonly waitingCount: number;
}

interface ReleaseWaitInput {
  readonly pluginId: string;
  readonly releaseWaitInDays: number;
}

/**
 * The one setting this suite changes.
 */
interface SettingsWithReleaseWait {
  // eslint-disable-next-line typescript-dev-toolkit/readonly-interface-members -- The suite writes this setting through the plugin's own editor.
  releaseWaitInDays: number;
}

afterEach(async () => {
  await setReleaseWait(0);
});

describe('The release wait', () => {
  it('keeps a waiting release out of the status bar count and marks it in the panel', async () => {
    await setReleaseWait(RELEASE_WAIT_COVERING_EVERY_RELEASE_IN_DAYS);

    const panel = await pollInObsidian({
      input: {
        modalSelector: MODAL_SELECTOR,
        pluginId: PLUGIN_ID
      },
      intervalInMilliseconds: POLL_INTERVAL_IN_MILLISECONDS,
      poll({ modalSelector }): PanelProbe {
        const modalEl = document.querySelector(modalSelector);
        const streamEls = modalEl ? [...modalEl.querySelectorAll('.app-update-notifier-stream')] : [];
        return {
          availableCount: streamEls.filter((el) => el.textContent.includes('An update is available.')).length,
          isModalOpen: streamEls.length > 0,
          waitingCount: streamEls.filter((el) => el.querySelector('.app-update-notifier-release-wait') !== null).length
        };
      },
      start({
        app,
        pluginId
      }): void {
        app.commands.executeCommandById(`${pluginId}:check-for-updates`);
      },
      timeoutInMilliseconds: FEED_TIMEOUT_IN_MILLISECONDS,
      timeoutMessage: 'the details panel never listed a stream',
      until: (probe: PanelProbe): boolean => probe.isModalOpen
    });

    const statusBarText = await evalInObsidian({
      callback({ statusBarSelector }): string {
        for (const closeEl of document.querySelectorAll('.modal-close-button')) {
          (closeEl as HTMLElement).click();
        }

        return document.querySelector(statusBarSelector)?.textContent ?? '';
      },
      input: { statusBarSelector: STATUS_BAR_SELECTOR }
    });

    expect(panel.waitingCount).toBe(panel.availableCount);
    expect(statusBarText).toBe('Obsidian: up to date');
  });
});

async function setReleaseWait(releaseWaitInDays: number): Promise<void> {
  await evalInObsidian({
    async callback({
      app,
      pluginId,
      releaseWaitInDays: days
    }): Promise<void> {
      // `PluginBase` keeps the component as a field the public `Plugin` type does not declare.
      const settingsComponent = Reflect.get(app.plugins.plugins[pluginId] ?? {}, 'pluginSettingsComponent') as EditableSettingsComponent;
      await settingsComponent.editAndSave((settings) => {
        settings.releaseWaitInDays = days;
      });
    },
    input: {
      pluginId: PLUGIN_ID,
      releaseWaitInDays
    } satisfies ReleaseWaitInput
  });
}

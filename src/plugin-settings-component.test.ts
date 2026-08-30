import type { DataHandler } from 'obsidian-dev-utils/obsidian/data-handler';
import type { PluginEventSource } from 'obsidian-dev-utils/obsidian/plugin/plugin-event-source';

import { noopAsync } from 'obsidian-dev-utils/function';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { checkIsInsiderBuild } from './platform-ex.ts';
import { PluginSettingsComponent } from './plugin-settings-component.ts';
import {
  BetaStreamMode,
  DEFAULT_CHECK_INTERVAL_IN_MINUTES,
  MIN_CHECK_INTERVAL_IN_MINUTES
} from './plugin-settings.ts';
import { ReleaseStreamId } from './release-streams.ts';

vi.mock('./platform-ex.ts', () => ({
  checkIsInsiderBuild: vi.fn()
}));

const mockedCheckIsInsiderBuild = vi.mocked(checkIsInsiderBuild);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('defaults', () => {
  it('should check hourly, matching Obsidian\'s own updater', () => {
    expect(createComponent().defaultSettings.checkIntervalInMinutes).toBe(DEFAULT_CHECK_INTERVAL_IN_MINUTES);
  });

  it('should follow Obsidian\'s own insider setting rather than assuming Catalyst', () => {
    expect(createComponent().defaultSettings.betaStreamMode).toBe(BetaStreamMode.Auto);
  });

  it('should start with nothing announced, one slot per stream', () => {
    expect(createComponent().defaultSettings.notifiedVersions).toEqual({
      [ReleaseStreamId.App]: '',
      [ReleaseStreamId.Beta]: '',
      [ReleaseStreamId.Installer]: ''
    });
  });

  it('should watch the installer and show the status bar item', () => {
    const settings = createComponent().defaultSettings;
    expect(settings.shouldWatchInstallerStream).toBe(true);
    expect(settings.shouldShowStatusBarItem).toBe(true);
  });
});

describe('checkShouldWatchBetaStream', () => {
  it('should watch it unconditionally in Always mode', async () => {
    const component = await createLoadedComponent();
    await component.editAndSave((settings) => {
      settings.betaStreamMode = BetaStreamMode.Always;
    });

    expect(component.checkShouldWatchBetaStream()).toBe(true);
    expect(mockedCheckIsInsiderBuild).not.toHaveBeenCalled();
  });

  it('should ignore it unconditionally in Never mode', async () => {
    const component = await createLoadedComponent();
    await component.editAndSave((settings) => {
      settings.betaStreamMode = BetaStreamMode.Never;
    });

    expect(component.checkShouldWatchBetaStream()).toBe(false);
    expect(mockedCheckIsInsiderBuild).not.toHaveBeenCalled();
  });

  it.each([
    [true, true],
    [false, false],
    [null, false]
  ])('should follow the insider setting (%s) in Auto mode', async (isInsiderBuild: boolean | null, shouldWatch: boolean) => {
    // A `null` reading means mobile, where the setting does not exist. Someone who cannot be on Catalyst
    // Should not be told a Catalyst build exists.
    mockedCheckIsInsiderBuild.mockReturnValue(isInsiderBuild);
    const component = await createLoadedComponent();

    expect(component.checkShouldWatchBetaStream()).toBe(shouldWatch);
  });
});

describe('notified versions', () => {
  it('should report a version as unannounced until it is recorded, and announced afterwards', async () => {
    const component = await createLoadedComponent();

    expect(component.checkWasNotified(ReleaseStreamId.App, '1.13.7')).toBe(false);

    await component.recordNotified(ReleaseStreamId.App, '1.13.7');

    expect(component.checkWasNotified(ReleaseStreamId.App, '1.13.7')).toBe(true);
  });

  it('should keep the streams independent', async () => {
    const component = await createLoadedComponent();

    await component.recordNotified(ReleaseStreamId.App, '1.13.7');

    expect(component.checkWasNotified(ReleaseStreamId.Installer, '1.13.7')).toBe(false);
  });

  it('should hold one entry per stream however many versions pass through, so it cannot grow', async () => {
    const component = await createLoadedComponent();

    await component.recordNotified(ReleaseStreamId.App, '1.13.7');
    await component.recordNotified(ReleaseStreamId.App, '1.13.8');

    expect(Object.keys(component.settings.notifiedVersions)).toHaveLength(3);
    expect(component.checkWasNotified(ReleaseStreamId.App, '1.13.7')).toBe(false);
    expect(component.checkWasNotified(ReleaseStreamId.App, '1.13.8')).toBe(true);
  });
});

describe('the check-interval validator', () => {
  it.each([
    [0, true],
    [MIN_CHECK_INTERVAL_IN_MINUTES, true],
    [DEFAULT_CHECK_INTERVAL_IN_MINUTES, true],
    [MIN_CHECK_INTERVAL_IN_MINUTES - 1, false],
    [1.5, false],
    [-1, false]
  ])('should accept %s: %s', async (value: number, isAccepted: boolean) => {
    const component = await createLoadedComponent();

    const message = await component.setProperty('checkIntervalInMinutes', value);

    expect(message === '').toBe(isAccepted);
  });
});

function createComponent(): PluginSettingsComponent {
  return new PluginSettingsComponent({
    dataHandler: createInMemoryDataHandler(),
    pluginEventSource: strictProxy<PluginEventSource>({
      on: vi.fn().mockReturnValue({ asyncEventSource: { offref: vi.fn() } })
    })
  });
}

/**
 * The real {@link DataHandler} contract is two methods over one blob, so an in-memory pair exercises the
 * genuine load/save path rather than standing in for it (G49).
 *
 * @returns The data handler.
 */
function createInMemoryDataHandler(): DataHandler {
  let data: unknown = null;
  return {
    loadData: () => Promise.resolve(data),
    saveData: (newData: unknown): Promise<void> => {
      data = newData;
      return noopAsync();
    }
  };
}

async function createLoadedComponent(): Promise<PluginSettingsComponent> {
  const component = createComponent();
  await component.loadWithPromises();
  return component;
}

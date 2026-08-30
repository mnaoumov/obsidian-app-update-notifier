import type { App as AppOriginal } from 'obsidian';
import type { StatusBarItemRegistrar } from 'obsidian-dev-utils/obsidian/status-bar-item-registrar';

import { waitForAllAsyncOperations } from 'obsidian-dev-utils/async';
import { noopAsync } from 'obsidian-dev-utils/function';
import { castTo } from 'obsidian-dev-utils/object-utils';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import { App } from 'obsidian-test-mocks/obsidian';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { PluginSettingsComponent } from './plugin-settings-component.ts';
import type { ReleaseStreamStatus } from './release-streams.ts';
import type { UpdateCheckerComponent } from './update-checker-component.ts';

import { PluginSettings } from './plugin-settings.ts';
import { ReleaseStreamId } from './release-streams.ts';
import { StatusBarComponent } from './status-bar-component.ts';
import { showUpdateDetails } from './update-details-modal.ts';

interface LastResultValue {
  statuses: readonly ReleaseStreamStatus[];
}

vi.mock('./update-details-modal.ts', () => ({
  showUpdateDetails: vi.fn(() => noopAsync())
}));

let app: AppOriginal;
let settings: PluginSettings;
let statusBarItemEl: HTMLElement;
let lastResult: LastResultValue | null;
let resultListeners: (() => void)[];

beforeEach(() => {
  vi.clearAllMocks();
  app = App.createConfigured__().asOriginalType__();
  settings = new PluginSettings();
  statusBarItemEl = createDiv();
  lastResult = null;
  resultListeners = [];
});

describe('the status bar item', () => {
  it('should say so before any check has succeeded', () => {
    loadComponent();

    expect(statusBarItemEl.getText()).toBe('Obsidian: not checked');
    expect(statusBarItemEl.getAttr('aria-label')).toContain('No update check has succeeded yet');
  });

  it('should report everything up to date when nothing is out of date', () => {
    lastResult = { statuses: [createStatus(ReleaseStreamId.App, false)] };

    loadComponent();

    expect(statusBarItemEl.getText()).toBe('Obsidian: up to date');
    expect(statusBarItemEl.hasClass('mod-warning')).toBe(false);
  });

  it('should count one update in the singular', () => {
    lastResult = { statuses: [createStatus(ReleaseStreamId.App, true)] };

    loadComponent();

    expect(statusBarItemEl.getText()).toBe('Obsidian: 1 update');
    expect(statusBarItemEl.hasClass('mod-warning')).toBe(true);
  });

  it('should count several updates in the plural', () => {
    lastResult = {
      statuses: [
        createStatus(ReleaseStreamId.App, true),
        createStatus(ReleaseStreamId.Installer, true)
      ]
    };

    loadComponent();

    expect(statusBarItemEl.getText()).toBe('Obsidian: 2 updates');
  });

  it('should hide when the setting is off', () => {
    settings.shouldShowStatusBarItem = false;

    loadComponent();

    expect(statusBarItemEl.hasClass('app-update-notifier-hidden')).toBe(true);
  });

  it('should hide where there is no stream to report, rather than say "unknown" forever', () => {
    lastResult = { statuses: [] };

    loadComponent();

    expect(statusBarItemEl.hasClass('app-update-notifier-hidden')).toBe(true);
  });

  it('should redraw when a check finishes', () => {
    loadComponent();

    lastResult = { statuses: [createStatus(ReleaseStreamId.App, true)] };
    for (const listener of resultListeners) {
      listener();
    }

    expect(statusBarItemEl.getText()).toBe('Obsidian: 1 update');
  });

  it('should open the details on click', async () => {
    loadComponent();

    statusBarItemEl.dispatchEvent(new MouseEvent('click'));
    await waitForAllAsyncOperations();

    expect(showUpdateDetails).toHaveBeenCalledWith({ app, result: lastResult });
  });

  it('should do nothing when refreshed before it is loaded', () => {
    // `refresh` is public and wired to the settings-save event, which can fire at any point in the
    // Plugin's lifecycle — including before this component has been given its element.
    expect(() => {
      createComponent().refresh();
    }).not.toThrow();
  });
});

function createComponent(): StatusBarComponent {
  return new StatusBarComponent({
    app,
    pluginSettingsComponent: castTo<PluginSettingsComponent>(strictProxy({
      get settings() {
        return settings;
      }
    })),
    statusBarItemRegistrar: strictProxy<StatusBarItemRegistrar>({
      addStatusBarItem: () => statusBarItemEl
    }),
    updateCheckerComponent: castTo<UpdateCheckerComponent>(strictProxy({
      addResultListener: (listener: () => void) => {
        resultListeners.push(listener);
      },
      get lastResult() {
        return lastResult;
      }
    }))
  });
}

function createStatus(id: ReleaseStreamId, isUpdateAvailable: boolean): ReleaseStreamStatus {
  return {
    changelogUrl: 'https://obsidian.md/changelog/',
    currentVersion: '1.13.6',
    id,
    isUpdateAvailable,
    latestVersion: '1.13.7'
  };
}

function loadComponent(): StatusBarComponent {
  const component = createComponent();
  component.load();
  return component;
}

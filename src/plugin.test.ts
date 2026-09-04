import type {
  App,
  PluginManifest
} from 'obsidian';

import { castTo } from 'obsidian-dev-utils/object-utils';
import { PluginSettingsTabComponent } from 'obsidian-dev-utils/obsidian/components/plugin-settings-tab-component';
import { App as AppCls } from 'obsidian-test-mocks/obsidian';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

interface ComponentModuleActual {
  Component: new () => object;
}

interface SaveSettingsListenerHolder {
  saveSettingsListeners: (() => void)[];
}

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));

// Stub the plugin's OWN sibling modules, each extending the real test-mocks `Component` so the real
// `PluginBase` lifecycle can load them as children without their heavy dependencies.
vi.mock('./plugin-settings-component.ts', async () => {
  const { Component } = await vi.importActual<ComponentModuleActual>('obsidian');
  const { PluginSettings } = await vi.importActual<typeof import('./plugin-settings.ts')>('./plugin-settings.ts');
  class PluginSettingsComponent extends Component {
    public saveSettingsListeners: (() => void)[] = [];
    public settings = new PluginSettings();

    public on(name: string, listener: () => void): unknown {
      if (name === 'saveSettings') {
        this.saveSettingsListeners.push(listener);
      }
      return { asyncEventSource: { offref: vi.fn() } };
    }
  }
  return { PluginSettingsComponent };
});

vi.mock('./plugin-settings-tab.ts', () => ({
  PluginSettingsTab: vi.fn()
}));

vi.mock('./update-checker-component.ts', async () => {
  const { Component } = await vi.importActual<ComponentModuleActual>('obsidian');
  const { noopAsync } = await vi.importActual<typeof import('obsidian-dev-utils/function')>('obsidian-dev-utils/function');
  class UpdateCheckerComponent extends Component {
    public addResultListener = vi.fn();
    public check = vi.fn(() => noopAsync());
    public lastResult = null;
  }
  return { UpdateCheckerComponent };
});

vi.mock('./status-bar-component.ts', async () => {
  const { Component } = await vi.importActual<ComponentModuleActual>('obsidian');
  class StatusBarComponent extends Component {
    public refresh = refresh;
  }
  return { StatusBarComponent };
});

// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { PluginSettingsComponent } from './plugin-settings-component.ts';
// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { Plugin } from './plugin.ts';
// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { StatusBarComponent } from './status-bar-component.ts';
// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { UpdateCheckerComponent } from './update-checker-component.ts';

const PLUGIN_MANIFEST: PluginManifest = {
  author: 'test',
  description: 'test',
  id: 'app-update-notifier',
  minAppVersion: '1.0.0',
  name: 'App Update Notifier',
  version: '1.0.0'
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Plugin', () => {
  it('should add its settings component, settings tab, checker and status bar item', async () => {
    const plugin = new Plugin(createConfiguredApp(), PLUGIN_MANIFEST);
    const addChildSpy = vi.spyOn(plugin, 'addChild');

    await plugin.onload();

    const addedChildren = addChildSpy.mock.calls.map((call) => call[0]);
    expect(addedChildren.some((child) => child instanceof PluginSettingsComponent)).toBe(true);
    expect(addedChildren.some((child) => child instanceof PluginSettingsTabComponent)).toBe(true);
    expect(addedChildren.some((child) => child instanceof UpdateCheckerComponent)).toBe(true);
    expect(addedChildren.some((child) => child instanceof StatusBarComponent)).toBe(true);
    plugin.unload();
  });

  it('should register the check and the open-demo-vault commands', async () => {
    const plugin = new Plugin(createConfiguredApp(), PLUGIN_MANIFEST);
    const addCommandSpy = vi.spyOn(plugin, 'addCommand');

    await plugin.onload();

    expect(addCommandSpy).toHaveBeenCalledWith(expect.objectContaining({ id: 'check-for-updates' }));
    expect(addCommandSpy).toHaveBeenCalledWith(expect.objectContaining({ id: 'open-demo-vault' }));
    plugin.unload();
  });

  it('should redraw the status bar item when the settings are saved', async () => {
    const plugin = new Plugin(createConfiguredApp(), PLUGIN_MANIFEST);
    const addChildSpy = vi.spyOn(plugin, 'addChild');

    await plugin.onload();

    // Turning the item back on must show it immediately, not at the next check up to an hour later.
    const settingsComponent = addChildSpy.mock.calls
      .map((call) => call[0])
      .find((child) => child instanceof PluginSettingsComponent);
    for (const listener of castTo<SaveSettingsListenerHolder>(settingsComponent).saveSettingsListeners) {
      listener();
    }

    expect(refresh).toHaveBeenCalledOnce();
    plugin.unload();
  });
});

function createConfiguredApp(): App {
  const appMock = AppCls.createConfigured__();
  appMock.workspace.onLayoutReady = vi.fn((callback: () => void) => {
    callback();
  });
  return appMock.asOriginalType__();
}

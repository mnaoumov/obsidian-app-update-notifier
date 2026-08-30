import type {
  App as AppOriginal,
  Plugin,
  SettingDefinition,
  SettingDefinitionGroup,
  SettingDefinitionItem,
  SettingGroup
} from 'obsidian';
import type { PluginSettingsComponentBase } from 'obsidian-dev-utils/obsidian/components/plugin-settings-component';

import { noopAsync } from 'obsidian-dev-utils/function';
import { castTo } from 'obsidian-dev-utils/object-utils';
import { PluginSettingsTabBase } from 'obsidian-dev-utils/obsidian/plugin/plugin-settings-tab';
import { SettingEx } from 'obsidian-dev-utils/obsidian/setting-ex';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import { App } from 'obsidian-test-mocks/obsidian';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { checkIsAutoUpdateDisabled } from './platform-ex.ts';
import { PluginSettingsTab } from './plugin-settings-tab.ts';
import { PluginSettings } from './plugin-settings.ts';

vi.mock('./platform-ex.ts', () => ({
  checkIsAutoUpdateDisabled: vi.fn()
}));

const EXPECTED_PROPERTY_NAMES = [
  'checkIntervalInMinutes',
  'betaStreamMode',
  'shouldWatchInstallerStream',
  'shouldShowStatusBarItem'
];

const EXPECTED_HEADINGS = [
  'Checking',
  'Streams',
  'Notifications',
  'This device'
];

let app: AppOriginal;

beforeEach(() => {
  vi.clearAllMocks();
  app = App.createConfigured__().asOriginalType__();
  vi.mocked(checkIsAutoUpdateDisabled).mockReturnValue(true);
  vi.spyOn(PluginSettingsTabBase.prototype, 'bind').mockImplementation((params) => params.valueComponent);
});

describe('PluginSettingsTab', () => {
  it('should declare a row for every setting the plugin owns, and no others', () => {
    const tab = createTab();

    renderRows(tab);

    expect(boundKeys()).toEqual(EXPECTED_PROPERTY_NAMES);
  });

  it('should not offer the notified-versions record as a setting', () => {
    // It is state the plugin keeps so a release is announced once, not a choice anyone makes.
    expect(boundKeys()).not.toContain('notifiedVersions');
  });

  it('should group the rows under the four headings', () => {
    expect(headings(createTab())).toEqual(EXPECTED_HEADINGS);
  });

  it('should put every row inside a group, leaving none loose at the top level', () => {
    for (const item of createTab().getSettingDefinitions()) {
      expect(item).toHaveProperty('items');
    }
  });

  it('should give every row a name', () => {
    for (const name of settingNames(createTab())) {
      expect(name).not.toBe('');
    }
  });

  it('should offer the three insider-stream modes', () => {
    const tab = createTab();
    const addedOptions: Record<string, string>[] = [];
    const setting = new SettingEx(tab.containerEl);
    vi.spyOn(setting, 'addDropdown').mockImplementation((callback) => {
      callback(castTo<Parameters<typeof callback>[0]>({
        addOptions: (options: Record<string, string>) => {
          addedOptions.push(options);
        }
      }));
      return setting;
    });

    const definition = flattenRows(tab.getSettingDefinitions()).find((row) => row.name === 'Insider builds');
    if (!definition || !('render' in definition)) {
      throw new Error('The insider-builds row is missing.');
    }
    definition.render(setting, castTo<SettingGroup>(null));

    expect(Object.values(addedOptions[0] ?? {})).toEqual(['Auto', 'Always', 'Never']);
  });

  describe('the read-only automatic-updates row', () => {
    it.each([
      [true, 'Off.'],
      [false, 'On.'],
      [null, 'This platform has no automatic-update setting.']
    ])('should describe the setting when it reads %s', (isAutoUpdateDisabled: boolean | null, expectedText: string) => {
      vi.mocked(checkIsAutoUpdateDisabled).mockReturnValue(isAutoUpdateDisabled);

      const row = flattenRows(createTab().getSettingDefinitions()).find((candidate) => candidate.name === 'Obsidian\'s own automatic updates');
      const desc = row?.desc;

      expect(desc instanceof DocumentFragment ? desc.textContent : '').toContain(expectedText);
    });

    it('should bind nothing, because this plugin reports Obsidian\'s setting and never writes it', () => {
      const tab = createTab();

      renderRows(tab);

      expect(boundKeys()).not.toContain('disableUpdate');
    });
  });
});

function boundKeys(): unknown[] {
  return vi.mocked(PluginSettingsTabBase.prototype.bind).mock.calls.map((call) => call[0].propertyName);
}

function createMockSettingsComponent(): PluginSettingsComponentBase<PluginSettings> {
  const validationMessages = Object.fromEntries(Object.keys(new PluginSettings()).map((name) => [name, '']));
  return strictProxy<PluginSettingsComponentBase<PluginSettings>>({
    defaultSettings: new PluginSettings(),
    on: vi.fn().mockReturnValue({ asyncEventSource: { offref: vi.fn() } }),
    revalidate: vi.fn(() => Promise.resolve(validationMessages)),
    saveToFile: vi.fn(() => noopAsync()),
    setProperty: vi.fn(() => Promise.resolve('')),
    settingsState: {
      effectiveValues: new PluginSettings(),
      inputValues: new PluginSettings(),
      validationMessages
    }
  });
}

function createTab(): PluginSettingsTab {
  const plugin = strictProxy<Plugin>({
    app,
    manifest: { id: 'app-update-notifier' }
  });
  return new PluginSettingsTab({
    plugin,
    pluginSettingsComponent: createMockSettingsComponent()
  });
}

/**
 * Flattens declared items into leaf rows, descending into groups and sub-pages alike.
 *
 * @param items - The declared items.
 * @returns The leaf rows.
 */
function flattenRows(items: SettingDefinitionItem[]): SettingDefinition[] {
  const rows: SettingDefinition[] = [];
  for (const item of items) {
    if ('items' in item) {
      rows.push(...flattenRows(castTo<SettingDefinitionItem[]>(item.items ?? [])));
      continue;
    }

    rows.push(castTo<SettingDefinition>(item));
  }

  return rows;
}

/**
 * Reads the group headings, in the order they are declared.
 *
 * @param tab - The settings tab.
 * @returns The headings.
 */
function headings(tab: PluginSettingsTab): string[] {
  return tab.getSettingDefinitions()
    .filter((item) => 'items' in item)
    .map((item) => castTo<SettingDefinitionGroup>(item).heading ?? '');
}

/**
 * Renders the declared rows the way Obsidian does when the tab is opened.
 *
 * No row declares a `visible` or `disabled` predicate, so the predicate-evaluating half of G101's
 * reference renderer is deliberately absent — it would be a branch no test can take, against a 100%
 * coverage gate. Add it back the moment a row grows a predicate.
 *
 * @param tab - The settings tab.
 */
function renderRows(tab: PluginSettingsTab): void {
  for (const row of flattenRows(tab.getSettingDefinitions())) {
    if (!('render' in row)) {
      continue;
    }

    const setting = new SettingEx(tab.containerEl);
    setting.setName(row.name);
    if (row.desc) {
      setting.setDesc(row.desc);
    }

    row.render(setting, castTo<SettingGroup>(null));
  }
}

/**
 * Reads the names of the declared rows, descending into the groups.
 *
 * @param tab - The settings tab.
 * @returns The names.
 */
function settingNames(tab: PluginSettingsTab): string[] {
  return flattenRows(tab.getSettingDefinitions()).map((row) => row.name);
}

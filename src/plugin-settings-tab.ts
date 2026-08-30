import type { SettingDefinitionItem } from 'obsidian';

import { Platform } from 'obsidian';
import { appendCodeBlock } from 'obsidian-dev-utils/obsidian/html-element';
import { PluginSettingsTabBase } from 'obsidian-dev-utils/obsidian/plugin/plugin-settings-tab';

import type { PluginSettings } from './plugin-settings.ts';

import { checkIsAutoUpdateDisabled } from './platform-ex.ts';
import {
  BetaStreamMode,
  MIN_CHECK_INTERVAL_IN_MINUTES
} from './plugin-settings.ts';

export class PluginSettingsTab extends PluginSettingsTabBase<PluginSettings> {
  /**
   * Grouped by the question each group answers: how often to look, what to look at, and how to be told.
   *
   * @returns The setting definitions.
   */
  protected override getSettingDefinitionItems(): SettingDefinitionItem[] {
    return [
      this.settingGroupEx({
        heading: 'Checking',
        items: [
          this.settingEx({
            desc: createFragment((f) => {
              f.appendText('How often to check, in minutes.');
              f.createEl('br');
              f.appendText('Set ');
              appendCodeBlock(f, '0');
              f.appendText(' to check only when you run the ');
              appendCodeBlock(f, 'Check for updates now');
              f.appendText(' command.');
              f.createEl('br');
              f.appendText(`The shortest accepted interval is ${String(MIN_CHECK_INTERVAL_IN_MINUTES)} minutes, which keeps the plugin well inside GitHub's rate limit.`);
            }),
            name: 'Check interval',
            render: (setting) => {
              setting.addNumber((number) => {
                this.bind({
                  propertyName: 'checkIntervalInMinutes',
                  valueComponent: number
                });
              });
            }
          })
        ]
      }),
      this.settingGroupEx({
        heading: 'Streams',
        items: [
          this.settingEx({
            desc: createFragment((f) => {
              f.appendText('When to watch the insider (Catalyst) channel.');
              f.createEl('br');
              appendCodeBlock(f, 'Auto');
              f.appendText(' follows Obsidian\'s own insider setting, so a vault without Catalyst is never told about a build it cannot get.');
            }),
            name: 'Insider builds',
            render: (setting) => {
              setting.addDropdown((dropdown) => {
                dropdown.addOptions({
                  /* eslint-disable perfectionist/sort-objects -- Need to keep enum order. */
                  [BetaStreamMode.Auto]: 'Auto',
                  [BetaStreamMode.Always]: 'Always',
                  [BetaStreamMode.Never]: 'Never'
                  /* eslint-enable perfectionist/sort-objects -- Need to keep enum order. */
                });
                this.bind({
                  propertyName: 'betaStreamMode',
                  valueComponent: dropdown
                });
              });
            }
          }),
          this.settingEx({
            desc: createFragment((f) => {
              f.appendText('Whether to watch the installer — the Obsidian executable on disk.');
              f.createEl('br');
              f.appendText('The installer updates separately from the app and carries the bundled Electron, which several Obsidian features have a minimum version of. Nothing else tells you it is behind.');
              f.createEl('br');
              f.appendText('Desktop only.');
            }),
            name: 'Watch the installer',
            render: (setting) => {
              setting.setDisabled(!Platform.isDesktopApp);
              setting.addToggle((toggle) => {
                this.bind({
                  propertyName: 'shouldWatchInstallerStream',
                  valueComponent: toggle
                });
              });
            }
          })
        ]
      }),
      this.settingGroupEx({
        heading: 'Notifications',
        items: [
          this.settingEx({
            desc: createFragment((f) => {
              f.appendText('Whether the status bar shows what is out of date. Click the item for versions and changelog links.');
              f.createEl('br');
              f.appendText('Each new version is also announced once with a notice, whatever this is set to.');
            }),
            name: 'Show the status bar item',
            render: (setting) => {
              setting.addToggle((toggle) => {
                this.bind({
                  propertyName: 'shouldShowStatusBarItem',
                  valueComponent: toggle
                });
              });
            }
          })
        ]
      }),
      this.settingGroupEx({
        heading: 'This device',
        items: [
          this.settingEx({
            desc: describeAutoUpdateState(),
            name: 'Obsidian\'s own automatic updates',
            render: () => {
              // Read-only. This plugin reports Obsidian's setting; it never writes it, because the whole
              // Point is to leave that choice alone and keep you informed either way.
            }
          })
        ]
      })
    ];
  }
}

function describeAutoUpdateState(): DocumentFragment {
  return createFragment((f) => {
    const isAutoUpdateDisabled = checkIsAutoUpdateDisabled();

    if (isAutoUpdateDisabled === null) {
      f.appendText('This platform has no automatic-update setting.');
      return;
    }

    if (isAutoUpdateDisabled) {
      f.appendText('Off. Obsidian is neither installing updates nor checking for them, which is exactly the case this plugin covers.');
      return;
    }

    f.appendText('On. Obsidian will install updates on its own; this plugin still reports the installer and insider streams, which it does not.');
  });
}

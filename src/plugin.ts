import { OpenBugReportCommandHandler } from '@mnaoumov/obsidian-lib/command-handlers/open-bug-report-command-handler';
import { OpenDemoVaultCommandHandler } from '@mnaoumov/obsidian-lib/command-handlers/open-demo-vault-command-handler';
import { PluginSettingsTabComponent } from '@mnaoumov/obsidian-lib/components/plugin-settings-tab-component';
import { PluginDataHandler } from '@mnaoumov/obsidian-lib/data-handler';
import { PluginBase } from '@mnaoumov/obsidian-lib/plugin/plugin';
import { PluginEventSourceImpl } from '@mnaoumov/obsidian-lib/plugin/plugin-event-source';
import { PluginStatusBarItemRegistrar } from '@mnaoumov/obsidian-lib/status-bar-item-registrar';

import { CheckForUpdatesCommandHandler } from './display/check-for-updates-command-handler.ts';
import { StatusBarComponent } from './display/status-bar-component.ts';
import { PluginSettingsComponent as PluginSettingsComponentImpl } from './settings/plugin-settings-component.ts';
import { PluginSettingsTab } from './settings/plugin-settings-tab.ts';
import { UpdateCheckerComponent } from './update-check/update-checker-component.ts';

export class Plugin extends PluginBase {
  protected override async onloadImpl(): Promise<void> {
    const pluginSettingsComponent = this.addChild(
      new PluginSettingsComponentImpl({
        dataHandler: new PluginDataHandler(this),
        pluginEventSource: new PluginEventSourceImpl(this)
      })
    );
    this.pluginSettingsComponent = pluginSettingsComponent;

    this.addChild(
      new PluginSettingsTabComponent({
        plugin: this,
        pluginSettingsTab: new PluginSettingsTab({
          plugin: this,
          pluginSettingsComponent
        })
      })
    );

    const updateCheckerComponent = this.addChild(
      new UpdateCheckerComponent({
        app: this.app,
        pluginNoticeComponent: this.pluginNoticeComponent,
        pluginSettingsComponent
      })
    );

    const statusBarComponent = this.addChild(
      new StatusBarComponent({
        app: this.app,
        pluginSettingsComponent,
        statusBarItemRegistrar: new PluginStatusBarItemRegistrar(this),
        updateCheckerComponent
      })
    );

    /*
     * The status bar item is hidden or shown by a setting, so it has to redraw when the settings are
     * saved and not only when a check finishes — otherwise turning it back on leaves it invisible until
     * the next check, up to an hour later.
     */
    pluginSettingsComponent.on('saveSettings', () => {
      statusBarComponent.refresh();
    });

    await this.commandHandlerComponent.registerCommandHandlers(() => [
      new CheckForUpdatesCommandHandler({
        app: this.app,
        updateCheckerComponent
      }),
      new OpenBugReportCommandHandler({
        app: this.app,
        gitHubRepo: 'mnaoumov/obsidian-app-update-notifier',
        pluginId: this.manifest.id
      }),
      new OpenDemoVaultCommandHandler({
        app: this.app,
        pluginId: this.manifest.id,
        pluginNoticeComponent: this.pluginNoticeComponent,
        pluginVersion: this.manifest.version
      })
    ]);
  }
}

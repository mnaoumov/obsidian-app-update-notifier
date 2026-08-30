import { OpenDemoVaultCommandHandler } from 'obsidian-dev-utils/obsidian/command-handlers/open-demo-vault-command-handler';
import { PluginSettingsTabComponent } from 'obsidian-dev-utils/obsidian/components/plugin-settings-tab-component';
import { PluginDataHandler } from 'obsidian-dev-utils/obsidian/data-handler';
import { PluginBase } from 'obsidian-dev-utils/obsidian/plugin/plugin';
import { PluginEventSourceImpl } from 'obsidian-dev-utils/obsidian/plugin/plugin-event-source';
import { PluginStatusBarItemRegistrar } from 'obsidian-dev-utils/obsidian/status-bar-item-registrar';

import { CheckForUpdatesCommandHandler } from './check-for-updates-command-handler.ts';
import { PluginSettingsComponent as PluginSettingsComponentImpl } from './plugin-settings-component.ts';
import { PluginSettingsTab } from './plugin-settings-tab.ts';
import { StatusBarComponent } from './status-bar-component.ts';
import { UpdateCheckerComponent } from './update-checker-component.ts';

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
      new OpenDemoVaultCommandHandler({
        app: this.app,
        pluginId: this.manifest.id,
        pluginNoticeComponent: this.pluginNoticeComponent,
        pluginVersion: this.manifest.version
      })
    ]);
  }
}

import type { App } from 'obsidian';

import {
  Notice,
  Platform
} from 'obsidian';
import { configureCommunityPlugin } from 'obsidian-dev-utils/obsidian/community-plugins';

const PLUGIN_ID = 'app-update-notifier';

const CHECK_COMMAND_ID = `${PLUGIN_ID}:check-for-updates`;

interface DemoSettingsPatch {
  betaStreamMode?: string;
  checkIntervalInMinutes?: number;
  notifiedVersions?: Record<string, string>;
  shouldShowStatusBarItem?: boolean;
  shouldWatchInstallerStream?: boolean;
}

interface PlatformVersions {
  build: string;
  version: string;
}

/**
 * Applies a settings patch, live, through the plugin's own settings component.
 *
 * Manual equivalent: change the same option in **Settings -> Community plugins -> App Update Notifier**.
 *
 * @param app - The Obsidian app.
 * @param patch - The settings to change.
 */
export async function changeSettings(app: App, patch: DemoSettingsPatch): Promise<void> {
  await configureCommunityPlugin({
    app,
    pluginId: PLUGIN_ID,
    settings: patch
  });
  new Notice('Applied.');
}

/**
 * Runs a check now and opens the details, exactly as the command palette does.
 *
 * Manual equivalent: run the **App Update Notifier: Check for updates now** command.
 *
 * @param app - The Obsidian app.
 */
export function checkForUpdatesNow(app: App): void {
  app.commands.executeCommandById(CHECK_COMMAND_ID);
}

/**
 * Forgets which versions have already been announced, so the next check announces them again.
 *
 * This is the counterpart to the plugin's own promise that a release is announced exactly once: without
 * it, the notice is a thing you can only ever see by accident.
 *
 * Manual equivalent: clear `notifiedVersions` in the plugin's `data.json`.
 *
 * @param app - The Obsidian app.
 */
export async function forgetAnnouncedVersions(app: App): Promise<void> {
  await configureCommunityPlugin({
    app,
    pluginId: PLUGIN_ID,
    settings: {
      notifiedVersions: {
        app: '',
        beta: '',
        installer: ''
      }
    }
  });
  new Notice('Forgotten. The next check announces whatever it finds.');
}

/**
 * Puts every setting this vault's buttons change back to its default.
 *
 * Manual equivalent: set each option back by hand in the plugin's settings tab.
 *
 * @param app - The Obsidian app.
 */
export async function restoreDefaults(app: App): Promise<void> {
  await changeSettings(app, {
    betaStreamMode: 'auto',
    checkIntervalInMinutes: 60,
    shouldShowStatusBarItem: true,
    shouldWatchInstallerStream: true
  });
}

/**
 * Prints what this machine is actually running, read from Obsidian itself rather than from the plugin.
 *
 * The app version and the installer version are separate fields for a reason, and seeing them differ is
 * the whole argument for the installer stream existing.
 *
 * @returns The versions, one per line.
 */
export function showThisMachine(): string {
  const platform = Platform as PlatformVersions & typeof Platform;
  const lines = [
    `App version:       ${platform.version || 'unknown'}`,
    `Installer version: ${Platform.isDesktopApp ? platform.build || 'unknown' : 'not applicable on mobile'}`,
    `Electron:          ${Platform.isDesktopApp ? process.versions['electron'] ?? 'unknown' : 'not applicable on mobile'}`,
    `Automatic updates: ${describeAutoUpdate()}`
  ];
  return lines.join('\n');
}

function describeAutoUpdate(): string {
  if (!Platform.isDesktopApp) {
    return 'not applicable on mobile';
  }

  // `disable-update` is read-only in this form. Never pass a second argument here — with one, the same
  // Channel WRITES the setting.
  return window.electron.ipcRenderer.sendSync('disable-update') ? 'off' : 'on';
}

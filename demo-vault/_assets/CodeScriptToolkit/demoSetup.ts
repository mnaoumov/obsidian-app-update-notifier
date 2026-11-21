import type { App } from 'obsidian';

import {
  Notice,
  Platform
} from 'obsidian';

const PLUGIN_ID = 'app-update-notifier';

const UPDATE_CHECK_COMMAND_ID = `${PLUGIN_ID}:check-for-updates`;

const DEFAULT_CHECK_INTERVAL_IN_MINUTES = 60;

interface DemoSettingsPatch {
  readonly betaStreamMode?: string;
  readonly checkIntervalInMinutes?: number;
  readonly notifiedVersions?: Readonly<Record<string, string>>;
  readonly shouldShowStatusBarItem?: boolean;
  readonly shouldWatchInstallerStream?: boolean;
}

interface EditableSettingsComponent {
  readonly editAndSave: (editor: (settings: DemoSettingsPatch) => void) => Promise<void>;
}

interface PlatformVersions {
  readonly build: string;
  readonly version: string;
}

interface PluginWithSettingsComponent {
  readonly pluginSettingsComponent?: EditableSettingsComponent;
}

/**
 * Applies a settings patch, live, through the plugin's own settings component.
 *
 * Manual equivalent: change the same option in **Settings -> Community plugins -> `App Update Notifier`**.
 *
 * @param app - The Obsidian app.
 * @param patch - The settings to change.
 */
export async function changeSettings(app: App, patch: DemoSettingsPatch): Promise<void> {
  await editSettings(app, patch);
  new Notice('Applied.');
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
  await editSettings(app, {
    notifiedVersions: {
      app: '',
      beta: '',
      installer: ''
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
    checkIntervalInMinutes: DEFAULT_CHECK_INTERVAL_IN_MINUTES,
    shouldShowStatusBarItem: true,
    shouldWatchInstallerStream: true
  });
}

/**
 * Runs a check now and opens the details, exactly as the command palette does.
 *
 * Manual equivalent: run the **`App Update Notifier`: Check for updates now** command.
 *
 * @param app - The Obsidian app.
 */
export function runUpdateCheckNow(app: App): void {
  app.commands.executeCommandById(UPDATE_CHECK_COMMAND_ID);
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
  // channel WRITES the setting.
  return window.electron.ipcRenderer.sendSync('disable-update') ? 'off' : 'on';
}

/*
 * Vault scripts can import only what `CodeScript Toolkit` serves as a built-in module, and it serves none of
 * the `@mnaoumov` packages yet, so this goes through the plugin's own settings component directly — the
 * same live `editAndSave` the library helper used, and what the settings tab itself calls.
 */
async function editSettings(app: App, patch: DemoSettingsPatch): Promise<void> {
  const plugin = app.plugins.getPlugin(PLUGIN_ID) as null | PluginWithSettingsComponent;
  const settingsComponent = plugin?.pluginSettingsComponent;
  if (!settingsComponent) {
    throw new Error(`Plugin '${PLUGIN_ID}' is not enabled.`);
  }

  await settingsComponent.editAndSave((settings) => {
    Object.assign(settings, patch);
  });
}

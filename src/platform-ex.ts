/**
 * @file
 *
 * The single place this plugin reads Obsidian's own version and update state from.
 *
 * `Platform.version` (the APP version) and `Platform.build` (the INSTALLER version) are both populated by
 * Obsidian at startup — `app.js:226329-226330` assigns them from `ipcRenderer.sendSync('version')` and
 * `electron.remote.app.getVersion()` — and are read here through `obsidian-typings`' `PlatformEx`. Both are
 * initialized to `''` (`app.js:40090-40091`), so an empty string means "not populated".
 */

import { getPlatformEx } from '@obsidian-typings/obsidian-public-latest/implementations';
import { Platform } from 'obsidian';

const DOWNLOAD_URL = 'https://obsidian.md/download';

/**
 * Obsidian maps Node's `process.platform` onto its own three-value `os` query parameter; anything it
 * does not name explicitly is treated as Linux (`app.js:61879`).
 */
const OS_BY_NODE_PLATFORM: Readonly<Record<string, string>> = {
  darwin: 'mac',
  win32: 'win'
};

/**
 * Reads whether Obsidian's own automatic updates are switched off.
 *
 * This is the reason the plugin exists: the same setting that stops Obsidian installing an update also
 * stops it CHECKING for one, so with it off nothing else reports that a release happened.
 *
 * @returns `true` when automatic updates are disabled, `false` when they are enabled, and `null` on
 * mobile, where the setting does not exist.
 */
export function checkIsAutoUpdateDisabled(): boolean | null {
  const ipcRenderer = getIpcRenderer();
  // Obsidian deletes the stored flag rather than storing `false`, so "enabled" reads back as `undefined`.
  return ipcRenderer ? ipcRenderer.sendSync('disable-update') === true : null;
}

/**
 * Reads whether the insider (Catalyst) build channel is switched on.
 *
 * ⚠️ The `null` argument is NOT optional and NOT a placeholder. `insider-build` is a read/write channel:
 * called with a boolean it WRITES the setting (`app.js:202189`), and only `null` reads it
 * (`app.js:202186`). Passing anything else here would silently switch a user's release channel.
 *
 * @returns `true` when the insider build channel is on, `false` when it is off, and `null` on mobile.
 */
export function checkIsInsiderBuild(): boolean | null {
  const ipcRenderer = getIpcRenderer();
  return ipcRenderer ? ipcRenderer.sendSync('insider-build', null) : null;
}

/**
 * Reads the running app version — the `obsidian.asar` bundle, which is what auto-update replaces.
 *
 * @returns The app version, or `null` when Obsidian has not populated it.
 */
export function getAppVersion(): null | string {
  return getPlatformEx().version || null;
}

/**
 * Builds the download link for the current platform, the same way Obsidian's own "installer version too
 * low" recommendation does (`app.js:61875-61886`) — so the link this plugin offers is the link Obsidian
 * would have offered.
 *
 * @returns The download URL.
 */
export function getDownloadUrl(): string {
  if (!Platform.isDesktopApp) {
    return `${DOWNLOAD_URL}?os=${Platform.isAndroidApp ? 'android' : 'ios'}`;
  }

  const os = OS_BY_NODE_PLATFORM[process.platform] ?? 'linux';
  return `${DOWNLOAD_URL}?os=${os}&arch=${process.arch}`;
}

/**
 * Reads the Electron version bundled with the current installer.
 *
 * Desktop only — there is no `process` on mobile.
 *
 * @returns The Electron version, or `null` on mobile.
 */
export function getElectronVersion(): null | string {
  if (!Platform.isDesktopApp) {
    return null;
  }

  // Bracketed because `process.versions` is an index signature, and `electron` is only present in it
  // when Obsidian is the Electron desktop app.
  return process.versions['electron'] ?? null;
}

/**
 * Reads the installer version — the Obsidian executable on disk, as opposed to the app bundle it loads.
 *
 * This is the version that carries Electron, so it is the one that gates the features with a minimum
 * Electron requirement, and it does NOT move when the app auto-updates.
 *
 * @returns The installer version, or `null` on mobile, where the distinction does not exist.
 */
export function getInstallerVersion(): null | string {
  return Platform.isDesktopApp ? getPlatformEx().build || null : null;
}

function getIpcRenderer(): null | typeof window.electron.ipcRenderer {
  return Platform.isDesktopApp ? window.electron.ipcRenderer : null;
}

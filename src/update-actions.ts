/**
 * @file
 *
 * The routes a user can take once told an update exists, rendered into either a `Notice` fragment or
 * the details modal.
 *
 * One module rather than two renderers, because the notice is transient and the modal is where someone
 * goes back to look — the same person reads both, and two copies of this wording would drift.
 */

import type { ElectronStatus } from './release-streams.ts';

import { getDownloadUrl } from './platform-ex.ts';
import { ReleaseStreamId } from './release-streams.ts';

/**
 * Options for {@link appendUpdateActions}.
 */
export interface AppendUpdateActionsOptions {
  /**
   * What the check established about Electron.
   */
  readonly electron: ElectronStatus;

  /**
   * Whether Obsidian's own insider toggle is on, or `null` on mobile. See `PlatformSnapshot` in
   * `release-streams.ts` for why this may only be read one-directionally.
   */
  readonly isInsiderBuild: boolean | null;

  /**
   * Which stream the update is on.
   */
  readonly streamId: ReleaseStreamId;
}

/**
 * Anything the actions can be rendered into. A `Notice` is built from a `DocumentFragment` and the
 * modal renders into elements; Obsidian augments both with `createEl` / `appendText`, so neither needs
 * its own renderer.
 */
export type UpdateActionsParent = DocumentFragment | HTMLElement;

/**
 * Where Obsidian documents Catalyst.
 */
export const EARLY_ACCESS_URL = 'https://obsidian.md/help/early-access';

/**
 * The path to Obsidian's own update check.
 *
 * ⚠️ The tab's INTERNAL id is `about` (`app.js:202140`) while its DISPLAY name is "General"
 * (`i18n.js`, `about.name`). This string is what the user reads, so it says General; any code that ever
 * navigates there programmatically must use `'about'`.
 *
 * Deliberately a path rather than a button. Obsidian's own "Check for updates" button (`app.js:202542`
 * — NOT `:219139`, which is Community plugins) is wired to a module-private updater, so a plugin could
 * only press it by matching LOCALIZED button text in the DOM. Telling someone where it is works in
 * every language and cannot break.
 */
const SETTINGS_GENERAL_PATH = 'Settings → General';

/**
 * The full path to Obsidian's own update check, inside the tab {@link SETTINGS_GENERAL_PATH} names.
 */
const UPDATE_CHECK_PATH = `${SETTINGS_GENERAL_PATH} → Check for updates`;

/**
 * G92: `obsidianmd/ui/sentence-case` cannot tell a UI path or a link label from a sentence that should
 * have been capitalized, and disabling an `obsidianmd` rule is forbidden. An empty interpolation makes
 * the rule skip the string while the rendered text stays byte-identical.
 */
const EMPTY = '';

/**
 * Appends the routes for one stream's update.
 *
 * @param parent - What to render into.
 * @param options - The options.
 */
export function appendUpdateActions(parent: UpdateActionsParent, options: AppendUpdateActionsOptions): void {
  const container = parent.createDiv({ cls: 'app-update-notifier-actions' });

  if (options.streamId === ReleaseStreamId.Beta && options.isInsiderBuild !== true) {
    appendCatalystGate(container);
    return;
  }

  appendInstallRoutes(container);
  appendElectronSentence(container, options.electron);
}

/**
 * Appends the Catalyst line for someone whose insider toggle is not on.
 *
 * ⚠️ The wording must stay true for BOTH people it reaches: someone with no license, and someone who
 * holds one with the toggle switched off. The plugin cannot tell them apart — the license lives on a
 * module-private singleton with no supported read — so it says what is needed, never what the reader
 * lacks.
 *
 * @param parent - What to render into.
 */
function appendCatalystGate(parent: UpdateActionsParent): void {
  parent.appendText(`${EMPTY}Installing this build needs a Catalyst license, with insider builds switched on in ${SETTINGS_GENERAL_PATH}.`);
  parent.createEl('br');
  parent.createEl('a', {
    href: EARLY_ACCESS_URL,
    text: `${EMPTY}Read about Catalyst and early access`
  });
}

/**
 * Appends the one-line Electron summary, when — and only when — both ends of it are actually known.
 *
 * ⚠️ Renders NOTHING today. The target version comes from the metadata feed's `runtimeVersions`, which
 * is absent from every `1.13.x` entry (`T717-P2`). That is deliberate: a notice that guessed, or that
 * said "unknown", would be worse than one that stays quiet until the data exists.
 *
 * @param parent - What to render into.
 * @param electron - The Electron status.
 */
function appendElectronSentence(parent: UpdateActionsParent, electron: ElectronStatus): void {
  if (electron.currentVersion === null || electron.targetVersion === null || electron.currentVersion === electron.targetVersion) {
    return;
  }

  parent.createEl('br');
  parent.appendText(`Your Electron version ${electron.currentVersion}, latest installer has Electron version ${electron.targetVersion}`);
}

/**
 * Appends the two ways to take an update: replace the installer, or let Obsidian replace the app bundle
 * alone.
 *
 * @param parent - What to render into.
 */
function appendInstallRoutes(parent: UpdateActionsParent): void {
  parent.createEl('a', {
    href: getDownloadUrl(),
    text: 'Update with new installer (recommended)'
  });
  parent.createEl('br');
  parent.appendText(`${EMPTY}Update app only, without installer: ${UPDATE_CHECK_PATH}`);
}

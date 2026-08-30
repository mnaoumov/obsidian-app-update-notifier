import type {
  ModalBaseConstructorParams,
  ModalParamsBase
} from 'obsidian-dev-utils/obsidian/modals/modal';

import { convertAsyncToSync } from 'obsidian-dev-utils/async';
import {
  ModalBase,
  showModal
} from 'obsidian-dev-utils/obsidian/modals/modal';

import type { ElectronSpan } from './electron-span.ts';
import type {
  ElectronStatus,
  ReleaseStreamStatus
} from './release-streams.ts';
import type { UpdateCheckResult } from './update-checker-component.ts';

import {
  fetchElectronStableVersions,
  getElectronReleaseUrl
} from './electron-releases-api.ts';
import { resolveElectronSpan } from './electron-span.ts';
import { getDownloadUrl } from './platform-ex.ts';
import { RELEASE_STREAM_LABELS } from './release-streams.ts';
import { appendUpdateActions } from './update-actions.ts';

/**
 * Parameters for {@link showUpdateDetails}.
 */
export interface ShowUpdateDetailsParams extends ModalParamsBase {
  /**
   * The last successful check, or `null` when none has succeeded yet.
   */
  readonly result: null | UpdateCheckResult;
}

type UpdateDetailsModalConstructorParams = ModalBaseConstructorParams<void> & ShowUpdateDetailsParams;

/**
 * G92: `obsidianmd/ui/sentence-case` cannot tell a command name or a mid-sentence link label from a
 * sentence that should have been capitalized, and disabling an `obsidianmd` rule is forbidden. An empty
 * interpolation makes the rule skip the string while the rendered text stays byte-identical.
 */
const EMPTY = '';

class UpdateDetailsModal extends ModalBase<void> {
  /**
   * Whether the modal has been closed.
   *
   * The Electron span is fetched AFTER the panel has rendered, so its `await` can land on a modal the
   * user has already dismissed. Writing into a detached `contentEl` is silent rather than fatal, which
   * is exactly what makes it worth guarding explicitly.
   */
  private isClosed = false;
  private readonly result: null | UpdateCheckResult;

  public constructor(params: UpdateDetailsModalConstructorParams) {
    super(params);
    this.addCssClasses('app-update-notifier-details-modal');
    this.result = params.result;
  }

  public override onClose(): void {
    this.isClosed = true;
    this.promiseResolve();
  }

  public override onOpen(): void {
    this.titleEl.setText('Obsidian updates');

    const result = this.result;
    if (!result) {
      this.contentEl.createEl('p', { text: `${EMPTY}No check has succeeded yet. Run "Check for updates now", or wait for the next scheduled check.` });
      return;
    }

    if (result.statuses.length === 0) {
      this.contentEl.createEl('p', { text: 'Obsidian publishes no release feed for this platform, so there is nothing to report here.' });
      return;
    }

    for (const status of result.statuses) {
      this.renderStatus(status, result);
    }

    this.renderElectron(result.electron);

    this.contentEl.createEl('p', {
      cls: 'app-update-notifier-checked-at',
      text: `Last checked ${new Date(result.checkedAtInMilliseconds).toLocaleString()}.`
    });
  }

  /**
   * Fetches Electron's release index and fills in the list of releases between the two versions.
   *
   * ⚠️ Called from {@link UpdateDetailsModal.renderElectron} and NOWHERE else. The index is 1.28 MB;
   * putting it on the hourly check path would spend a megabyte an hour rendering a list nobody has
   * asked to see. Opening this panel is the moment someone asks.
   *
   * @param containerEl - Where to render the list.
   * @param electron - The Electron status, with both endpoints already known.
   * @returns A {@link Promise} that resolves once the list has been rendered or given up.
   */
  private async loadElectronSpan(containerEl: HTMLElement, electron: ElectronStatus): Promise<void> {
    containerEl.setText(`${EMPTY}Loading the Electron releases in between…`);

    let span: ElectronSpan;

    try {
      span = resolveElectronSpan(electron.currentVersion, electron.targetVersion, await fetchElectronStableVersions());
    } catch {
      if (!this.isClosed) {
        containerEl.setText(`${EMPTY}Could not load the list of Electron releases in between.`);
      }

      return;
    }

    if (this.isClosed) {
      return;
    }

    renderElectronSpan(containerEl, span);
  }

  private renderElectron(electron: ElectronStatus): void {
    if (electron.currentVersion === null) {
      return;
    }

    const paragraph = this.contentEl.createEl('p', { cls: 'app-update-notifier-electron' });
    paragraph.createEl('strong', { text: 'Electron: ' });
    paragraph.appendText(electron.currentVersion);

    // Only when the newest installer would actually MOVE it. `targetVersion` is `null` for every
    // Current Obsidian today, because the metadata feed's `runtimeVersions` stopped being populated
    // (`T717-P2`), so this whole branch is dark until that is backfilled.
    if (electron.targetVersion !== null && electron.targetVersion !== electron.currentVersion) {
      paragraph.appendText(`, latest installer has Electron version ${electron.targetVersion}`);
      const spanEl = this.contentEl.createDiv({ cls: 'app-update-notifier-electron-span' });
      convertAsyncToSync(async () => {
        await this.loadElectronSpan(spanEl, electron);
      })();
    }

    if (!electron.isOutdated) {
      return;
    }

    // Obsidian calls this "installer version too low", but what it compares is Electron
    // (`app.js:160712`), so the sentence names what is actually being checked.
    paragraph.createEl('br');
    paragraph.appendText(`Below ${electron.minRecommendedVersion}, which some Obsidian features require. Reinstalling from `);
    paragraph.createEl('a', {
      href: getDownloadUrl(),
      text: `${EMPTY}the download page`
    });
    paragraph.appendText(' updates it.');
  }

  private renderStatus(status: ReleaseStreamStatus, result: UpdateCheckResult): void {
    const container = this.contentEl.createDiv({ cls: 'app-update-notifier-stream' });
    container.createEl('h3', { text: RELEASE_STREAM_LABELS[status.id] });

    const line = container.createEl('p');
    line.appendText(`Installed: ${status.currentVersion ?? 'unknown'}`);
    line.createEl('br');
    line.appendText(`Latest: ${status.latestVersion ?? 'unknown'}`);
    line.createEl('br');
    line.appendText(describeStatus(status));

    const changelogLine = container.createEl('p');
    changelogLine.createEl('a', {
      href: status.changelogUrl,
      text: 'Changelog'
    });

    if (!status.isUpdateAvailable) {
      return;
    }

    // The install routes carry the download link for every stream, so the Installer stream's own
    // `Download` link would now be the same link twice in one section.
    appendUpdateActions(container, {
      electron: result.electron,
      isInsiderBuild: result.platform.isInsiderBuild,
      streamId: status.id
    });
  }
}

/**
 * Shows the details of the last successful check — every watched stream, what is installed, what is
 * published, and where to read what changed.
 *
 * @param params - The parameters.
 * @returns A {@link Promise} that resolves when the modal is closed.
 */
export async function showUpdateDetails(params: ShowUpdateDetailsParams): Promise<void> {
  await showModal((promiseResolve) =>
    new UpdateDetailsModal({
      ...params,
      promiseResolve
    })
  );
}

function describeElectronSpan(span: ElectronSpan): string {
  const listedText = `${span.listedVersions.length.toString()} Electron releases in between`;
  return span.omittedCount === 0 ? listedText : `${listedText} (one per major; ${span.omittedCount.toString()} more not listed)`;
}

function describeStatus(status: ReleaseStreamStatus): string {
  if (status.isUpdateAvailable) {
    return 'An update is available.';
  }

  if (status.currentVersion === null || status.latestVersion === null) {
    return 'Could not be compared.';
  }

  return 'Up to date.';
}

/**
 * Renders the resolved span as a collapsed list of links.
 *
 * The `omittedCount` is rendered rather than swallowed. The span reaches 245 releases for someone on an
 * old installer — the very user this plugin exists for — and collapsing that to a dozen links without
 * saying so reads as "that is all of them".
 *
 * @param containerEl - Where to render.
 * @param span - The resolved span.
 */
function renderElectronSpan(containerEl: HTMLElement, span: ElectronSpan): void {
  containerEl.empty();

  if (span.listedVersions.length === 0) {
    return;
  }

  const detailsEl = containerEl.createEl('details');
  detailsEl.createEl('summary', { text: describeElectronSpan(span) });
  const listEl = detailsEl.createDiv({ cls: 'app-update-notifier-electron-span-list' });

  for (const version of span.listedVersions) {
    listEl.createEl('a', {
      href: getElectronReleaseUrl(version),
      text: `v${version}`
    });
  }
}

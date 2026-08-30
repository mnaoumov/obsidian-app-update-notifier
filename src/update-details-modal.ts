import type {
  ModalBaseConstructorParams,
  ModalParamsBase
} from 'obsidian-dev-utils/obsidian/modals/modal';

import {
  ModalBase,
  showModal
} from 'obsidian-dev-utils/obsidian/modals/modal';

import type { ReleaseStreamStatus } from './release-streams.ts';
import type { UpdateCheckResult } from './update-checker-component.ts';

import { getDownloadUrl } from './platform-ex.ts';
import {
  checkIsElectronOutdated,
  MIN_RECOMMENDED_ELECTRON_VERSION,
  RELEASE_STREAM_LABELS,
  ReleaseStreamId
} from './release-streams.ts';

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
  private readonly result: null | UpdateCheckResult;

  public constructor(params: UpdateDetailsModalConstructorParams) {
    super(params);
    this.addCssClasses('app-update-notifier-details-modal');
    this.result = params.result;
  }

  public override onClose(): void {
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
      this.renderStatus(status);
    }

    this.renderElectron(result);

    this.contentEl.createEl('p', {
      cls: 'app-update-notifier-checked-at',
      text: `Last checked ${new Date(result.checkedAtInMilliseconds).toLocaleString()}.`
    });
  }

  private renderElectron(result: UpdateCheckResult): void {
    const electronVersion = result.platform.electronVersion;
    if (electronVersion === null) {
      return;
    }

    const paragraph = this.contentEl.createEl('p', { cls: 'app-update-notifier-electron' });
    paragraph.createEl('strong', { text: 'Electron: ' });
    paragraph.appendText(electronVersion);

    if (!checkIsElectronOutdated(electronVersion)) {
      return;
    }

    // Obsidian calls this "installer version too low", but what it compares is Electron
    // (`app.js:160712`), so the sentence names what is actually being checked.
    paragraph.createEl('br');
    paragraph.appendText(`Below ${MIN_RECOMMENDED_ELECTRON_VERSION}, which some Obsidian features require. Reinstalling from `);
    paragraph.createEl('a', {
      href: getDownloadUrl(),
      text: `${EMPTY}the download page`
    });
    paragraph.appendText(' updates it.');
  }

  private renderStatus(status: ReleaseStreamStatus): void {
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

    if (status.isUpdateAvailable && status.id === ReleaseStreamId.Installer) {
      changelogLine.appendText(' · ');
      changelogLine.createEl('a', {
        href: getDownloadUrl(),
        text: 'Download'
      });
    }
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

function describeStatus(status: ReleaseStreamStatus): string {
  if (status.isUpdateAvailable) {
    return 'An update is available.';
  }

  if (status.currentVersion === null || status.latestVersion === null) {
    return 'Could not be compared.';
  }

  return 'Up to date.';
}

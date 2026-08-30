import type { App } from 'obsidian';
import type { PluginNoticeComponent } from 'obsidian-dev-utils/obsidian/components/plugin-notice-component';

import { Platform } from 'obsidian';
import { convertAsyncToSync } from 'obsidian-dev-utils/async';
import { getDebugger } from 'obsidian-dev-utils/debug';
import { ComponentEx } from 'obsidian-dev-utils/obsidian/components/component-ex';
import { CallbackLayoutReadyComponent } from 'obsidian-dev-utils/obsidian/components/layout-ready-component';

import type { ObsidianMetadata } from './obsidian-metadata-api.ts';
import type { PluginSettingsComponent } from './plugin-settings-component.ts';
import type {
  ElectronStatus,
  PlatformSnapshot,
  ReleaseFeeds,
  ReleaseStreamStatus
} from './release-streams.ts';

import { fetchObsidianMetadata } from './obsidian-metadata-api.ts';
import {
  fetchChangelogEntries,
  fetchDesktopReleases,
  fetchGitHubReleases
} from './obsidian-releases-api.ts';
import {
  checkIsInsiderBuild,
  getAppVersion,
  getElectronVersion,
  getInstallerVersion
} from './platform-ex.ts';
import {
  ReleaseStreamId,
  resolveAppStreamStatus,
  resolveBetaStreamStatus,
  resolveElectronStatus,
  resolveInstallerStreamStatus
} from './release-streams.ts';
import { appendUpdateActions } from './update-actions.ts';

/**
 * What the most recent SUCCESSFUL check found.
 */
export interface UpdateCheckResult {
  /**
   * When the check completed, as a millisecond timestamp.
   */
  readonly checkedAtInMilliseconds: number;

  /**
   * What the check established about Electron. Reported whether or not the installer stream is being
   * watched — someone who switched that setting off still deserves to be told their Electron is below
   * the floor.
   */
  readonly electron: ElectronStatus;

  /**
   * The platform state the check was resolved against.
   */
  readonly platform: PlatformSnapshot;

  /**
   * One status per stream being watched, in display order.
   */
  readonly statuses: readonly ReleaseStreamStatus[];
}

interface UpdateCheckerComponentConstructorParams {
  readonly app: App;
  readonly pluginNoticeComponent: PluginNoticeComponent;
  readonly pluginSettingsComponent: PluginSettingsComponent;
}

const MILLISECONDS_PER_MINUTE = 60_000;

/**
 * The heartbeat. Deliberately far shorter than any check interval: the interval is a SETTING, and
 * ticking once a minute and comparing elapsed time means changing it takes effect immediately, with no
 * timer to tear down and re-register on every save.
 */
const TICK_INTERVAL_IN_MILLISECONDS = MILLISECONDS_PER_MINUTE;

export class UpdateCheckerComponent extends ComponentEx {
  /**
   * The most recent successful check, or `null` before the first one has succeeded.
   *
   * A failed check leaves this alone. Going offline must not make the plugin forget what it already
   * knew, and it must never turn "cannot tell" into "up to date".
   *
   * @returns The last successful result.
   */
  public get lastResult(): null | UpdateCheckResult {
    return this._lastResult;
  }

  private readonly _debugger = getDebugger('app-update-notifier:update-checker');
  private _lastResult: null | UpdateCheckResult = null;
  private readonly app: App;
  private readonly listeners: (() => void)[] = [];
  private readonly pluginNoticeComponent: PluginNoticeComponent;
  private readonly pluginSettingsComponent: PluginSettingsComponent;

  public constructor(params: UpdateCheckerComponentConstructorParams) {
    super();
    this.app = params.app;
    this.pluginNoticeComponent = params.pluginNoticeComponent;
    this.pluginSettingsComponent = params.pluginSettingsComponent;
  }

  /**
   * Registers a listener called whenever {@link UpdateCheckerComponent.lastResult} changes.
   *
   * @param listener - The listener.
   */
  public addResultListener(listener: () => void): void {
    this.listeners.push(listener);
  }

  /**
   * Runs one check.
   *
   * Never throws: a check that fails is a check that found nothing, and the plugin's whole job is to be
   * quietly informative. A MANUAL check does report its failure, because someone who just asked
   * deserves an answer either way.
   *
   * @param shouldReportFailure - Whether to show a notice when the check fails.
   * @returns A {@link Promise} that resolves once the check has finished.
   */
  public async check(shouldReportFailure = false): Promise<void> {
    try {
      const feeds = await fetchFeeds();
      const platform = readPlatformSnapshot();
      const statuses = this.resolveStatuses(feeds, platform);
      const electron = resolveElectronStatus(feeds, platform);

      this._lastResult = {
        checkedAtInMilliseconds: Date.now(),
        electron,
        platform,
        statuses
      };

      await this.notifyNewVersions(statuses, electron, platform);
      this.fireResultChanged();
    } catch (error) {
      this._debugger('Update check failed', error);
      if (shouldReportFailure) {
        this.pluginNoticeComponent.showNotice('Could not check for Obsidian updates. See the console for details.');
      }
    }
  }

  public override onload(): void {
    super.onload();

    this.addChild(
      new CallbackLayoutReadyComponent(this.app, async () => {
        await this.check();
      })
    );

    this.registerInterval(window.setInterval(
      convertAsyncToSync(async () => {
        await this.tick();
      }),
      TICK_INTERVAL_IN_MILLISECONDS
    ));
  }

  private fireResultChanged(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private async notifyNewVersions(statuses: readonly ReleaseStreamStatus[], electron: ElectronStatus, platform: PlatformSnapshot): Promise<void> {
    for (const status of statuses) {
      if (!status.isUpdateAvailable || status.latestVersion === null) {
        continue;
      }

      if (this.pluginSettingsComponent.checkWasNotified(status.id, status.latestVersion)) {
        continue;
      }

      this.pluginNoticeComponent.showNotice(createUpdateNoticeFragment(status, status.latestVersion, electron, platform.isInsiderBuild));
      await this.pluginSettingsComponent.recordNotified(status.id, status.latestVersion);
    }
  }

  private resolveStatuses(feeds: ReleaseFeeds, platform: PlatformSnapshot): ReleaseStreamStatus[] {
    // Obsidian publishes no release feed of any kind for iOS, so there is nothing truthful to say
    // There — better than reporting the Android version to an iPhone.
    if (!platform.isDesktopApp && !platform.isAndroidApp) {
      return [];
    }

    const statuses = [resolveAppStreamStatus(feeds, platform)];

    if (this.pluginSettingsComponent.checkShouldWatchBetaStream()) {
      statuses.push(resolveBetaStreamStatus(feeds, platform));
    }

    if (platform.isDesktopApp && this.pluginSettingsComponent.settings.shouldWatchInstallerStream) {
      statuses.push(resolveInstallerStreamStatus(feeds, platform));
    }

    return statuses;
  }

  private async tick(): Promise<void> {
    const intervalInMinutes = this.pluginSettingsComponent.settings.checkIntervalInMinutes;
    if (intervalInMinutes === 0) {
      return;
    }

    const lastResult = this._lastResult;
    if (lastResult && Date.now() - lastResult.checkedAtInMilliseconds < intervalInMinutes * MILLISECONDS_PER_MINUTE) {
      return;
    }

    await this.check();
  }
}

/**
 * Builds a notice that can be acted on without leaving Obsidian: what happened, where to read about it,
 * and the routes to take it.
 *
 * The links inside need no dismissal guard. G54 records that a `Notice`'s dismiss is a bubble-phase
 * handler a child click reaches, so an interactive child needs `stopPropagation()` — but that is for
 * BUTTONS, which must leave the notice standing. These are links: following one navigates away, and the
 * notice closing behind it is the correct outcome. The "update app only" route is deliberately a path
 * the reader follows, not a button (see `update-actions.ts`), so nothing here has to stay open.
 *
 * @param status - The stream status being announced.
 * @param version - The version being announced.
 * @param electron - What the check established about Electron.
 * @param isInsiderBuild - Whether Obsidian's insider toggle is on, or `null` on mobile.
 * @returns The notice fragment.
 */
function createUpdateNoticeFragment(
  status: ReleaseStreamStatus,
  version: string,
  electron: ElectronStatus,
  isInsiderBuild: boolean | null
): DocumentFragment {
  return createFragment((f) => {
    f.appendText(createUpdateNoticeText(status, version));
    f.createEl('br');
    f.createEl('a', {
      href: status.changelogUrl,
      text: 'Read the changelog'
    });
    appendUpdateActions(f, {
      electron,
      isInsiderBuild,
      streamId: status.id
    });
  });
}

/**
 * One sentence per stream rather than one sentence with the stream name bolted onto it: an installer
 * update and an app update ask different things of the reader, and "(Installer)" appended to "Obsidian
 * 1.13.7 is available" reads as though the app were out of date when it may not be.
 *
 * @param status - The stream status.
 * @param version - The version being announced. Passed in rather than read off the status, because the
 * caller has already established it is known — a status with an unknown version is never announced.
 * @returns The notice text.
 */
function createUpdateNoticeText(status: ReleaseStreamStatus, version: string): string {
  switch (status.id) {
    case ReleaseStreamId.Beta: {
      return `Obsidian ${version} is available on the insider (Catalyst) channel.`;
    }
    case ReleaseStreamId.Installer: {
      return `A newer Obsidian installer is available: ${version}. Installing it also updates the bundled Electron.`;
    }
    default: {
      return `Obsidian ${version} is available.`;
    }
  }
}

async function fetchFeeds(): Promise<ReleaseFeeds> {
  const [changelogEntries, desktopReleases, gitHubReleases, metadata] = await Promise.all([
    fetchChangelogEntries(),
    fetchDesktopReleases(),
    fetchGitHubReleases(),
    fetchOptionalMetadata()
  ]);

  return {
    changelogEntries,
    desktopReleases,
    gitHubReleases,
    metadata
  };
}

/**
 * Fetches the enrichment feed, treating any failure as "it had nothing to add".
 *
 * ⚠️ Asymmetric on purpose, and the asymmetry is the whole design. The other three feeds are Obsidian's
 * own: a check that cannot read them genuinely does not know the answer, so their rejection propagates
 * and the check reports failure. This one is a third-party mirror that only ever supplies a preferred
 * answer over one the public feeds already give, so its being down must degrade the notice, never the
 * check. Wrapping it here rather than at the call site keeps `Promise.all` above — a `catch` that
 * belongs to one feed should not turn the other three into `allSettled` and lose their failure.
 *
 * @returns A {@link Promise} resolving to the metadata, or to `null` when it could not be read.
 */
async function fetchOptionalMetadata(): Promise<null | ObsidianMetadata> {
  try {
    return await fetchObsidianMetadata();
  } catch {
    return null;
  }
}

function readPlatformSnapshot(): PlatformSnapshot {
  return {
    appVersion: getAppVersion(),
    electronVersion: getElectronVersion(),
    installerVersion: getInstallerVersion(),
    isAndroidApp: Platform.isAndroidApp,
    isDesktopApp: Platform.isDesktopApp,
    isInsiderBuild: checkIsInsiderBuild()
  };
}

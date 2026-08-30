import type { App } from 'obsidian';
import type { PluginNoticeComponent } from 'obsidian-dev-utils/obsidian/components/plugin-notice-component';

import { Platform } from 'obsidian';
import { convertAsyncToSync } from 'obsidian-dev-utils/async';
import { getDebugger } from 'obsidian-dev-utils/debug';
import { ComponentEx } from 'obsidian-dev-utils/obsidian/components/component-ex';
import { CallbackLayoutReadyComponent } from 'obsidian-dev-utils/obsidian/components/layout-ready-component';

import type { PluginSettingsComponent } from './plugin-settings-component.ts';
import type {
  PlatformSnapshot,
  ReleaseFeeds,
  ReleaseStreamStatus
} from './release-streams.ts';

import {
  fetchChangelogEntries,
  fetchDesktopReleases,
  fetchGitHubReleases
} from './obsidian-releases-api.ts';
import {
  getAppVersion,
  getElectronVersion,
  getInstallerVersion
} from './platform-ex.ts';
import {
  ReleaseStreamId,
  resolveAppStreamStatus,
  resolveBetaStreamStatus,
  resolveInstallerStreamStatus
} from './release-streams.ts';

/**
 * What the most recent SUCCESSFUL check found.
 */
export interface UpdateCheckResult {
  /**
   * When the check completed, as a millisecond timestamp.
   */
  readonly checkedAtInMilliseconds: number;

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

      this._lastResult = {
        checkedAtInMilliseconds: Date.now(),
        platform,
        statuses
      };

      await this.notifyNewVersions(statuses);
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

  private async notifyNewVersions(statuses: readonly ReleaseStreamStatus[]): Promise<void> {
    for (const status of statuses) {
      if (!status.isUpdateAvailable || status.latestVersion === null) {
        continue;
      }

      if (this.pluginSettingsComponent.checkWasNotified(status.id, status.latestVersion)) {
        continue;
      }

      this.pluginNoticeComponent.showNotice(createUpdateNoticeFragment(status));
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

function createUpdateNoticeFragment(status: ReleaseStreamStatus): DocumentFragment {
  return createFragment((f) => {
    f.appendText(createUpdateNoticeText(status));
    f.createEl('br');
    f.createEl('a', {
      href: status.changelogUrl,
      text: 'Read the changelog'
    });
  });
}

/**
 * One sentence per stream rather than one sentence with the stream name bolted onto it: an installer
 * update and an app update ask different things of the reader, and "(Installer)" appended to "Obsidian
 * 1.13.7 is available" reads as though the app were out of date when it may not be.
 *
 * @param status - The stream status.
 * @returns The notice text.
 */
function createUpdateNoticeText(status: ReleaseStreamStatus): string {
  const version = status.latestVersion ?? '';

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
  const [changelogEntries, desktopReleases, gitHubReleases] = await Promise.all([
    fetchChangelogEntries(),
    fetchDesktopReleases(),
    fetchGitHubReleases()
  ]);

  return {
    changelogEntries,
    desktopReleases,
    gitHubReleases
  };
}

function readPlatformSnapshot(): PlatformSnapshot {
  return {
    appVersion: getAppVersion(),
    electronVersion: getElectronVersion(),
    installerVersion: getInstallerVersion(),
    isAndroidApp: Platform.isAndroidApp,
    isDesktopApp: Platform.isDesktopApp
  };
}

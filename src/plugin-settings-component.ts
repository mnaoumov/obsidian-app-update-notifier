import type { DataHandler } from 'obsidian-dev-utils/obsidian/data-handler';
import type { PluginEventSource } from 'obsidian-dev-utils/obsidian/plugin/plugin-event-source';

import { PluginSettingsComponentBase } from 'obsidian-dev-utils/obsidian/components/plugin-settings-component';

import type { ReleaseStreamId } from './release-streams.ts';

import { checkIsInsiderBuild } from './platform-ex.ts';
import {
  BetaStreamMode,
  MIN_CHECK_INTERVAL_IN_MINUTES,
  PluginSettings
} from './plugin-settings.ts';

interface PluginSettingsComponentConstructorParams {
  readonly dataHandler: DataHandler;
  readonly pluginEventSource: PluginEventSource;
}

export class PluginSettingsComponent extends PluginSettingsComponentBase<PluginSettings> {
  public constructor(params: PluginSettingsComponentConstructorParams) {
    super({
      dataHandler: params.dataHandler,
      pluginEventSource: params.pluginEventSource,
      pluginSettingsClass: PluginSettings
    });
  }

  /**
   * Whether the insider (Catalyst) stream should be watched right now.
   *
   * {@link BetaStreamMode.Auto} asks Obsidian rather than the user: someone who has never turned
   * Catalyst on has no use for being told a beta exists, and someone who has almost certainly does.
   *
   * @returns `true` when the beta stream should be watched.
   */
  public checkShouldWatchBetaStream(): boolean {
    switch (this.settings.betaStreamMode) {
      case BetaStreamMode.Always: {
        return true;
      }
      case BetaStreamMode.Never: {
        return false;
      }
      default: {
        return checkIsInsiderBuild() ?? false;
      }
    }
  }

  /**
   * Whether a version on a stream has already been announced.
   *
   * @param streamId - The stream.
   * @param version - The version.
   * @returns `true` when it has already been announced.
   */
  public checkWasNotified(streamId: ReleaseStreamId, version: string): boolean {
    return this.settings.notifiedVersions[streamId] === version;
  }

  /**
   * Records that a version on a stream has been announced, so it is never announced again.
   *
   * @param streamId - The stream.
   * @param version - The version.
   * @returns A {@link Promise} that resolves once the record is persisted.
   */
  public async recordNotified(streamId: ReleaseStreamId, version: string): Promise<void> {
    await this.editAndSave((settings) => {
      settings.notifiedVersions[streamId] = version;
    });
  }

  protected override registerValidators(): void {
    super.registerValidators();

    // An empty message means valid; 0 is the documented "never check on a schedule" value, so it is
    // Accepted alongside the real interval range rather than clamped into it.
    this.registerValidator('checkIntervalInMinutes', (value) => {
      const isValid = value === 0 || (Number.isSafeInteger(value) && value >= MIN_CHECK_INTERVAL_IN_MINUTES);
      return isValid ? '' : `Should be 0, or a whole number of minutes not below ${String(MIN_CHECK_INTERVAL_IN_MINUTES)}.`;
    });
  }
}

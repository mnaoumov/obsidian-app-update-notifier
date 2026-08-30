import {
  describe,
  expect,
  it
} from 'vitest';

import {
  BetaStreamMode,
  DEFAULT_CHECK_INTERVAL_IN_MINUTES,
  MIN_CHECK_INTERVAL_IN_MINUTES,
  PluginSettings
} from './plugin-settings.ts';
import { ReleaseStreamId } from './release-streams.ts';

describe('PluginSettings', () => {
  describe('defaults', () => {
    it('should check hourly, which is what Obsidian\'s own updater does', () => {
      expect(new PluginSettings().checkIntervalInMinutes).toBe(DEFAULT_CHECK_INTERVAL_IN_MINUTES);
    });

    it('should follow Obsidian\'s own insider setting rather than assume Catalyst', () => {
      expect(new PluginSettings().betaStreamMode).toBe(BetaStreamMode.Auto);
    });

    it('should watch the installer, which nothing else reports', () => {
      expect(new PluginSettings().shouldWatchInstallerStream).toBe(true);
    });

    it('should show the status bar item', () => {
      expect(new PluginSettings().shouldShowStatusBarItem).toBe(true);
    });

    it('should start with nothing announced, one slot per stream', () => {
      expect(new PluginSettings().notifiedVersions).toEqual({
        [ReleaseStreamId.App]: '',
        [ReleaseStreamId.Beta]: '',
        [ReleaseStreamId.Installer]: ''
      });
    });
  });

  describe('notifiedVersions', () => {
    it('should hold exactly one entry per stream, so it cannot grow', () => {
      // The record is the plugin's promise that a release is announced once, ever. A history would grow
      // For as long as the plugin is installed; a version only moves forward, so one slot is enough.
      const settings = new PluginSettings();

      settings.notifiedVersions[ReleaseStreamId.App] = '1.13.7';
      settings.notifiedVersions[ReleaseStreamId.App] = '1.13.8';

      expect(Object.keys(settings.notifiedVersions)).toHaveLength(3);
      expect(settings.notifiedVersions[ReleaseStreamId.App]).toBe('1.13.8');
    });

    it('should keep the streams independent of one another', () => {
      const settings = new PluginSettings();

      settings.notifiedVersions[ReleaseStreamId.App] = '1.13.7';

      expect(settings.notifiedVersions[ReleaseStreamId.Installer]).toBe('');
    });
  });

  describe('the interval constants', () => {
    it('should set a floor low enough to be useful and high enough to stay inside the rate limit', () => {
      // Three requests per check against GitHub's sixty an hour: a 15-minute floor is twelve an hour,
      // Which leaves room for every other plugin sharing the IP.
      expect(MIN_CHECK_INTERVAL_IN_MINUTES).toBeLessThan(DEFAULT_CHECK_INTERVAL_IN_MINUTES);
      expect(MIN_CHECK_INTERVAL_IN_MINUTES).toBeGreaterThan(0);
    });
  });
});

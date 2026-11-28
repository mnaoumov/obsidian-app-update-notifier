import { ReleaseStreamId } from '../update-check/release-streams.ts';

/**
 * When to watch the insider (Catalyst) stream.
 */
export enum BetaStreamMode {
  /**
   * Always watch it, whatever Obsidian's own insider toggle says.
   */
  Always = 'always',

  /**
   * Follow Obsidian's own insider toggle. Someone without Catalyst is not told a beta exists.
   */
  Auto = 'auto',

  /**
   * Never watch it.
   */
  Never = 'never'
}

/**
 * The default check interval, matching Obsidian's own updater, which runs
 * `setInterval(queueUpdate, 60 * 60 * 1000)`.
 */
export const DEFAULT_CHECK_INTERVAL_IN_MINUTES = 60;

/**
 * The shortest interval accepted. GitHub allows 60 unauthenticated requests an hour per IP.
 *
 * ⚠️ A check makes four requests but only ONE of them counts against that budget — `api.github.com`.
 * The other three go to `obsidian.md` and `raw.githubusercontent.com`, which are different hosts with
 * their own, far looser limits. (This corrects an earlier note here claiming a check cost three of the
 * sixty; it never did.) The floor stays at 15 regardless: four times an hour is already far more often
 * than a release happens, and the headroom is what keeps a vault sharing an IP with several plugins
 * clear of the limit.
 */
export const MIN_CHECK_INTERVAL_IN_MINUTES = 15;

/**
 * The waits the settings tab offers, in days. `0` is off. Any other whole number of days is still
 * honoured when written to `data.json` by hand.
 */
// eslint-disable-next-line no-magic-numbers -- The list IS the set of named choices; naming each number would only repeat it.
export const RELEASE_WAIT_OPTIONS_IN_DAYS: readonly number[] = [0, 1, 3, 7, 14];

export class PluginSettings {
  /**
   * When to watch the insider (Catalyst) stream.
   */
  public betaStreamMode: BetaStreamMode = BetaStreamMode.Auto;

  /**
   * How often to check, in minutes. `0` switches scheduled checks off and leaves only the command.
   */
  public checkIntervalInMinutes: number = DEFAULT_CHECK_INTERVAL_IN_MINUTES;

  /**
   * The newest version already announced for each stream, so a release is announced exactly once, ever.
   *
   * Kept here — in the plugin's own `data.json` — rather than in `localStorage`, so it survives a reload
   * and can be read and edited like any other setting. It holds one entry per stream and no history, so
   * it cannot grow: a version only ever moves forward.
   */
  public notifiedVersions: Record<ReleaseStreamId, string> = {
    [ReleaseStreamId.App]: '',
    [ReleaseStreamId.Beta]: '',
    [ReleaseStreamId.Installer]: ''
  };

  /**
   * How many days a new release must have been public on its stream before it is announced or counted
   * in the status bar. `0` (the default) announces it at once. The details panel lists a held release
   * either way.
   */
  public releaseWaitInDays = 0;

  /**
   * Whether mobile gets a ribbon action, shown only while an update is available, since mobile has no
   * status bar.
   */
  public shouldShowMobileRibbonAction = true;

  /**
   * Whether the status bar carries an item showing what is out of date.
   */
  public shouldShowStatusBarItem = true;

  /**
   * Whether to watch the installer stream. Desktop only — mobile has no installer version.
   */
  public shouldWatchInstallerStream = true;
}

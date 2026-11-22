/**
 * @file
 *
 * The optional release wait: a new release is held back from the notice and the status bar count
 * until it has been public on its stream for a set number of days, so a cautious reader hears about
 * `1.x.0` only after its usual hotfix window. Pure functions over a resolved status, a setting and a
 * clock, so the rule is testable without timers.
 *
 * A newer release on the same stream restarts the wait by construction: the status carries the date of
 * its NEWEST version only, and the wait counts from that.
 */

import type { ReleaseStreamStatus } from './release-streams.ts';

const MILLISECONDS_PER_DAY = 86_400_000;

/**
 * Whether a stream's update is held back right now.
 *
 * @param status - The stream status.
 * @param releaseWaitInDays - The wait setting. `0` switches the wait off.
 * @param nowInMilliseconds - The current time.
 * @returns `true` while the update is still inside its wait.
 */
export function checkIsReleaseHeld(status: ReleaseStreamStatus, releaseWaitInDays: number, nowInMilliseconds: number): boolean {
  const waitEnd = getReleaseWaitEndInMilliseconds(status, releaseWaitInDays);
  return waitEnd !== null && nowInMilliseconds < waitEnd;
}

/**
 * Resolves when the wait on a stream's update ends.
 *
 * ⚠️ An update no feed dates is never held. The wait is a delay, never a filter: holding an undated
 * release would hold it for as long as the feed stays silent, which can be forever, and the reader
 * would never hear about it at all.
 *
 * @param status - The stream status.
 * @param releaseWaitInDays - The wait setting. `0` switches the wait off.
 * @returns The millisecond timestamp the wait ends at, or `null` when nothing is waited for: the wait
 * is off, there is no update, or the update is undated.
 */
export function getReleaseWaitEndInMilliseconds(status: ReleaseStreamStatus, releaseWaitInDays: number): null | number {
  return releaseWaitInDays <= 0 || !status.isUpdateAvailable || status.publishedAtInMilliseconds === null ? null : status.publishedAtInMilliseconds + releaseWaitInDays * MILLISECONDS_PER_DAY;
}

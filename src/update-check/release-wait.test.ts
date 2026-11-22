import {
  describe,
  expect,
  it
} from 'vitest';

import type { ReleaseStreamStatus } from './release-streams.ts';

import { ReleaseStreamId } from './release-streams.ts';
import {
  checkIsReleaseHeld,
  getReleaseWaitEndInMilliseconds
} from './release-wait.ts';

const MILLISECONDS_PER_DAY = 86_400_000;
const PUBLISHED_AT = Date.parse('2026-11-12T15:43:18Z');

describe('getReleaseWaitEndInMilliseconds', () => {
  it('should end the wait the set number of days after the release was published', () => {
    expect(getReleaseWaitEndInMilliseconds(createStatus(), 7)).toBe(PUBLISHED_AT + 7 * MILLISECONDS_PER_DAY);
  });

  it('should wait for nothing while the setting is off', () => {
    expect(getReleaseWaitEndInMilliseconds(createStatus(), 0)).toBeNull();
  });

  it('should wait for nothing when there is no update', () => {
    expect(getReleaseWaitEndInMilliseconds(createStatus({ isUpdateAvailable: false }), 7)).toBeNull();
  });

  it('should never hold a release no feed dates', () => {
    // A delay, never a filter: an undated release held until it is dated could be held forever.
    expect(getReleaseWaitEndInMilliseconds(createStatus({ publishedAtInMilliseconds: null }), 7)).toBeNull();
  });
});

describe('checkIsReleaseHeld', () => {
  it('should hold the release until the wait ends, and not a moment after', () => {
    const waitEnd = PUBLISHED_AT + 3 * MILLISECONDS_PER_DAY;
    expect(checkIsReleaseHeld(createStatus(), 3, PUBLISHED_AT)).toBe(true);
    expect(checkIsReleaseHeld(createStatus(), 3, waitEnd - 1)).toBe(true);
    expect(checkIsReleaseHeld(createStatus(), 3, waitEnd)).toBe(false);
  });

  it('should restart the wait for a newer release on the same stream', () => {
    // The status carries only its newest version's date, so a hotfix published on day 6 of a 7-day
    // wait is itself held for 7 more days.
    const now = PUBLISHED_AT + 8 * MILLISECONDS_PER_DAY;
    expect(checkIsReleaseHeld(createStatus(), 7, now)).toBe(false);
    expect(checkIsReleaseHeld(createStatus({ latestVersion: '1.15.2', publishedAtInMilliseconds: PUBLISHED_AT + 6 * MILLISECONDS_PER_DAY }), 7, now)).toBe(true);
  });

  it('should not hold anything while the setting is off', () => {
    expect(checkIsReleaseHeld(createStatus(), 0, PUBLISHED_AT)).toBe(false);
  });
});

function createStatus(overrides: Partial<ReleaseStreamStatus> = {}): ReleaseStreamStatus {
  return {
    changelogUrl: 'https://obsidian.md/changelog/2026-11-12-desktop-v1.15.1/',
    currentVersion: '1.15.0',
    id: ReleaseStreamId.App,
    isUpdateAvailable: true,
    latestVersion: '1.15.1',
    publishedAtInMilliseconds: PUBLISHED_AT,
    ...overrides
  };
}

import type { RequestUrlResponse } from 'obsidian';

import { requestUrl } from 'obsidian';
import { castTo } from 'obsidian-dev-utils/object-utils';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { ElectronRelease } from './electron-releases-api.ts';

import {
  ELECTRON_RELEASES_URL,
  fetchElectronStableVersions,
  getElectronReleaseUrl
} from './electron-releases-api.ts';

vi.mock('obsidian', async (importOriginal) => ({
  ...await importOriginal<typeof import('obsidian')>(),
  requestUrl: vi.fn()
}));

const mockedRequestUrl = vi.mocked(requestUrl);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetchElectronStableVersions', () => {
  it('should read the release index', async () => {
    mockRequestUrl([{ version: '39.8.3' }]);

    await fetchElectronStableVersions();

    expect(mockedRequestUrl).toHaveBeenCalledWith(ELECTRON_RELEASES_URL);
  });

  it('should drop pre-releases, which no Obsidian installer ever bundles', async () => {
    // The real index is mostly these — 2215 of its 3375 entries on 2026-08-30 — so listing them as
    // Versions someone "passed through" would be wrong as well as unreadable.
    mockRequestUrl([
      { version: '46.0.0-nightly.20260828' },
      { version: '45.0.0-alpha.1' },
      { version: '44.0.0-beta.7' },
      { version: '43.1.1' },
      { version: '39.8.3' }
    ]);

    expect(await fetchElectronStableVersions()).toEqual(['43.1.1', '39.8.3']);
  });

  it('should keep the feed\'s own order rather than sort', async () => {
    mockRequestUrl([{ version: '39.8.3' }, { version: '34.5.8' }]);
    expect(await fetchElectronStableVersions()).toEqual(['39.8.3', '34.5.8']);
  });
});

describe('getElectronReleaseUrl', () => {
  it('should build the v-prefixed release page URL', () => {
    expect(getElectronReleaseUrl('43.1.1')).toBe('https://releases.electronjs.org/release/v43.1.1');
  });
});

function mockRequestUrl(releases: ElectronRelease[]): void {
  mockedRequestUrl.mockResolvedValue(castTo<RequestUrlResponse>({ json: releases }));
}

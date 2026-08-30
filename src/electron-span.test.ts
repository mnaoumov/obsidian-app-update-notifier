import {
  describe,
  expect,
  it
} from 'vitest';

import {
  MAX_LISTED_ELECTRON_RELEASES,
  resolveElectronSpan
} from './electron-span.ts';

/**
 * Deliberately out of order, and carrying a pre-release the real feed is full of (2215 of its 3375
 * entries). Both are things the resolver has to survive, and a tidy ascending fixture would prove
 * neither.
 */
const STABLE_VERSIONS: readonly string[] = ['36.0.0', '34.5.8', '35.1.0', '35.0.0', '37.0.0'];

describe('resolveElectronSpan', () => {
  it('should list what is strictly newer, up to and including the target', () => {
    const span = resolveElectronSpan('34.5.8', '36.0.0', STABLE_VERSIONS);

    expect(span.listedVersions).toEqual(['35.0.0', '35.1.0', '36.0.0']);
    expect(span.omittedCount).toBe(0);
  });

  it('should exclude the version already installed, which is not a version anyone is moving to', () => {
    expect(resolveElectronSpan('34.5.8', '36.0.0', STABLE_VERSIONS).listedVersions).not.toContain('34.5.8');
  });

  it('should exclude anything past the target', () => {
    expect(resolveElectronSpan('34.5.8', '36.0.0', STABLE_VERSIONS).listedVersions).not.toContain('37.0.0');
  });

  it('should be empty when the two ends are the same version', () => {
    expect(resolveElectronSpan('36.0.0', '36.0.0', STABLE_VERSIONS)).toEqual({
      listedVersions: [],
      omittedCount: 0
    });
  });

  it('should ignore a version the feed carries that is not a version at all', () => {
    expect(resolveElectronSpan('34.5.8', '36.0.0', [...STABLE_VERSIONS, 'not-a-version']).listedVersions).toEqual(['35.0.0', '35.1.0', '36.0.0']);
  });

  describe('when an end is unknown', () => {
    /*
     * "We cannot tell" must never render as "there is nothing in between". This is the production state
     * today for the target: the metadata feed's `runtimeVersions` is absent for every 1.13.x
     * (`T717-P2`), so every real call currently lands here.
     */
    it.each([
      ['the installed version is unknown', null, '36.0.0'],
      ['the target is unknown', '34.5.8', null],
      ['both are unknown', null, null],
      ['the installed version is not a version', 'unknown', '36.0.0'],
      ['the target is not a version', '34.5.8', 'unknown']
    ])('should report an empty span when %s', (_description, currentVersion, targetVersion) => {
      expect(resolveElectronSpan(currentVersion, targetVersion, STABLE_VERSIONS)).toEqual({
        listedVersions: [],
        omittedCount: 0
      });
    });
  });

  describe('when the span is too long to list', () => {
    const LONG_SPAN_VERSIONS = createVersions(30, 40);

    it('should keep every version while the span is within the cap', () => {
      const span = resolveElectronSpan('30.0.0', '30.0.19', createVersions(30, 31));
      expect(span.listedVersions).toHaveLength(MAX_LISTED_ELECTRON_RELEASES - 1);
      expect(span.omittedCount).toBe(0);
    });

    it('should collapse to one per major and say how many it left out', () => {
      const span = resolveElectronSpan('30.0.0', '39.0.19', LONG_SPAN_VERSIONS);

      // Nine majors survive: 30 (the rest of it) through 39.
      expect(span.listedVersions).toEqual(['30.0.19', '31.0.19', '32.0.19', '33.0.19', '34.0.19', '35.0.19', '36.0.19', '37.0.19', '38.0.19', '39.0.19']);
      expect(span.omittedCount).toBe(199 - 10);
    });

    it('should keep the target, which is the version the whole span is aimed at', () => {
      const span = resolveElectronSpan('30.0.0', '39.0.19', LONG_SPAN_VERSIONS);
      expect(span.listedVersions.at(-1)).toBe('39.0.19');
    });

    it('should never claim to have listed what it dropped', () => {
      const span = resolveElectronSpan('30.0.0', '39.0.19', LONG_SPAN_VERSIONS);
      // 30.0.1 through 39.0.19 — the whole fixture minus the installed version and the 40.x major,
      // Which sits past the target.
      expect(span.listedVersions.length + span.omittedCount).toBe(199);
    });
  });
});

function createVersions(firstMajor: number, lastMajor: number): string[] {
  const versions: string[] = [];

  for (let majorVersion = firstMajor; majorVersion <= lastMajor; majorVersion++) {
    for (let patchVersion = 0; patchVersion < 20; patchVersion++) {
      versions.push(`${majorVersion.toString()}.0.${patchVersion.toString()}`);
    }
  }

  return versions;
}

import { Platform } from 'obsidian';
import { castTo } from 'obsidian-dev-utils/object-utils';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import {
  checkIsAutoUpdateDisabled,
  checkIsInsiderBuild,
  getAppVersion,
  getDownloadUrl,
  getElectronVersion,
  getInstallerVersion
} from './platform-ex.ts';

interface MutablePlatform {
  build: string;
  isAndroidApp: boolean;
  isDesktopApp: boolean;
  version: string;
}

vi.mock('obsidian', async (importOriginal) => ({
  ...await importOriginal<typeof import('obsidian')>(),
  Platform: {
    build: '',
    isAndroidApp: false,
    isDesktopApp: true,
    version: ''
  }
}));

const platform = castTo<MutablePlatform>(Platform);

const sendSync = vi.fn();
let originalElectron: unknown;
let originalPlatform: string;
let originalArch: string;

beforeEach(() => {
  vi.clearAllMocks();
  platform.build = '1.13.4';
  platform.isAndroidApp = false;
  platform.isDesktopApp = true;
  platform.version = '1.13.6';

  originalElectron = castTo<Record<string, unknown>>(window)['electron'];
  castTo<Record<string, unknown>>(window)['electron'] = { ipcRenderer: { sendSync } };

  originalPlatform = process.platform;
  originalArch = process.arch;
});

afterEach(() => {
  castTo<Record<string, unknown>>(window)['electron'] = originalElectron;
  redefineProcess('platform', originalPlatform);
  redefineProcess('arch', originalArch);
});

describe('getAppVersion', () => {
  it('should read the running app version', () => {
    expect(getAppVersion()).toBe('1.13.6');
  });

  it('should report an unpopulated version as unknown rather than as an empty string', () => {
    platform.version = '';
    expect(getAppVersion()).toBeNull();
  });
});

describe('getInstallerVersion', () => {
  it('should read the installer version separately from the app version', () => {
    expect(getInstallerVersion()).toBe('1.13.4');
    expect(getInstallerVersion()).not.toBe(getAppVersion());
  });

  it('should report an unpopulated installer version as unknown', () => {
    platform.build = '';
    expect(getInstallerVersion()).toBeNull();
  });

  it('should not apply on mobile', () => {
    platform.isDesktopApp = false;
    expect(getInstallerVersion()).toBeNull();
  });
});

describe('getElectronVersion', () => {
  it('should read the bundled Electron version', () => {
    const originalVersions = process.versions;
    Object.defineProperty(process, 'versions', {
      configurable: true,
      value: { ...originalVersions, electron: '34.5.8' }
    });

    try {
      expect(getElectronVersion()).toBe('34.5.8');
    } finally {
      Object.defineProperty(process, 'versions', {
        configurable: true,
        value: originalVersions
      });
    }
  });

  it('should report no Electron when the running process does not carry one', () => {
    const originalVersions = process.versions;
    const versionsWithoutElectron = { ...originalVersions };
    delete castTo<Record<string, unknown>>(versionsWithoutElectron)['electron'];
    Object.defineProperty(process, 'versions', {
      configurable: true,
      value: versionsWithoutElectron
    });

    try {
      expect(getElectronVersion()).toBeNull();
    } finally {
      Object.defineProperty(process, 'versions', {
        configurable: true,
        value: originalVersions
      });
    }
  });

  it('should report no Electron when the app is not the Electron build', () => {
    platform.isDesktopApp = false;
    expect(getElectronVersion()).toBeNull();
  });
});

describe('checkIsAutoUpdateDisabled', () => {
  it('should report Obsidian\'s own automatic-update setting', () => {
    sendSync.mockReturnValue(true);
    expect(checkIsAutoUpdateDisabled()).toBe(true);
    expect(sendSync).toHaveBeenCalledWith('disable-update');
  });

  it('should not apply on mobile', () => {
    platform.isDesktopApp = false;
    expect(checkIsAutoUpdateDisabled()).toBeNull();
    expect(sendSync).not.toHaveBeenCalled();
  });
});

describe('checkIsInsiderBuild', () => {
  it('should read the insider setting with a null argument, which is the only form that does not WRITE it', () => {
    // A boolean argument switches the user's release channel (`app.js:202189`). This assertion is the
    // Guard against that call ever being "simplified" into a write.
    sendSync.mockReturnValue(false);
    expect(checkIsInsiderBuild()).toBe(false);
    expect(sendSync).toHaveBeenCalledWith('insider-build', null);
  });

  it('should not apply on mobile', () => {
    platform.isDesktopApp = false;
    expect(checkIsInsiderBuild()).toBeNull();
    expect(sendSync).not.toHaveBeenCalled();
  });
});

describe('getDownloadUrl', () => {
  it.each([
    ['win32', 'win'],
    ['darwin', 'mac'],
    ['freebsd', 'linux']
  ])('should map the %s process platform onto os=%s', (nodePlatform: string, os: string) => {
    redefineProcess('platform', nodePlatform);
    redefineProcess('arch', 'x64');
    expect(getDownloadUrl()).toBe(`https://obsidian.md/download?os=${os}&arch=x64`);
  });

  it('should ask for the Android build on Android', () => {
    platform.isDesktopApp = false;
    platform.isAndroidApp = true;
    expect(getDownloadUrl()).toBe('https://obsidian.md/download?os=android');
  });

  it('should ask for the iOS build on iOS', () => {
    platform.isDesktopApp = false;
    platform.isAndroidApp = false;
    expect(getDownloadUrl()).toBe('https://obsidian.md/download?os=ios');
  });
});

function redefineProcess(propertyName: string, value: string): void {
  Object.defineProperty(process, propertyName, {
    configurable: true,
    value
  });
}

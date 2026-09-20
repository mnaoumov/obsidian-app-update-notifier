import type { ObsidianPluginVitestConfigContext } from 'obsidian-dev-utils/script-utils/test-runners/vitest-config';
import type { TestProjectConfiguration } from 'vitest/config';

import { defineObsidianPluginVitestConfig } from 'obsidian-dev-utils/script-utils/test-runners/vitest-config';

/**
 * The screenshot-capture suites that write
 * `images/screenshots/screenshot-*.png`.
 *
 * They are named `*.desktop-capture.` / `*.android-capture.` rather than
 * `*.desktop.` / `*.android.` so they match NONE of the standard project globs.
 * That keeps them out of `npm run test:integration` entirely — capturing is an
 * explicit operation (`npm run capture:screenshots`), not something every test
 * run does. Folding them into the standard projects would rewrite ten PNGs on
 * every run and dirty the tree mid-release.
 */
const DESKTOP_CAPTURE_TEST_FILES = 'src/**/*.desktop-capture.integration.test.ts';
const ANDROID_CAPTURE_TEST_FILES = 'src/**/*.android-capture.integration.test.ts';

/**
 * The AVD the mobile shots are taken on: 900x1600 at density 320, which is
 * exactly the size the community store asks for, so the capture needs no crop,
 * no rescale and no letterbox. The shared `obsidian_test` AVD is a Pixel 10 Pro
 * XL at 1344x2994 (~9:20) and cannot produce it; resizing that one at runtime
 * destroys the Appium session, because the display change recreates the
 * activity and with it the WebView the session is attached to.
 *
 * Needs one-time provisioning, and all three steps are non-obvious:
 *
 * 1. The harness never installs the Obsidian APK. It launches the emulator and
 *    starts `md.obsidian`, so a fresh AVD fails with `Activity class
 *    {md.obsidian/md.obsidian.MainActivity} does not exist`.
 * 2. An install only persists if the emulator SAVES ITS SNAPSHOT. The harness
 *    launches with `-no-snapshot-save`, which discards everything the session
 *    did: an `adb install` under that flag reports `Success` and the package is
 *    gone on the next boot. Boot WITHOUT the flag, install, then `adb emu kill`.
 * 3. Obsidian's first-run onboarding has to be completed by hand once. Until
 *    someone taps through the vault-creation flow, the app sits on its welcome
 *    screen, `layoutReady` never becomes true, and setup fails after the FULL
 *    timeout with `Obsidian layout did not become ready`.
 */
const SCREENSHOT_AVD_NAME = 'obsidian_screenshots';

/**
 * The Electron shell (installer build) the desktop shots are taken on, frozen deliberately.
 *
 * Shot 2 is the details panel, and the frame worth putting in front of a store visitor is the one where
 * the plugin has something to report: the app current, the installer behind, and the two update routes in
 * view. An installer frozen well below the public line produces that frame on ANY day, because `Latest`
 * only ever moves up — where an unpinned run produces whatever the machine happens to have. `1.13.4` is
 * the exact installer the committed 2026-08-30 shot ran, so a recapture reproduces that frame rather than
 * replacing it.
 *
 * When a future `public-latest` asar stops booting on this shell the harness throws
 * `IncompatibleInstallerVersionError` from version resolution, before anything is launched — a loud
 * prompt to raise this pin, never a silently worse screenshot.
 */
const CAPTURE_INSTALLER_VERSION = '1.13.4';

/**
 * The Obsidian app version (asar) the desktop shots are taken on.
 *
 * `public-latest` rather than the user's installed copy, because the harness now provisions a Catalyst
 * build: the 2026-09-03 recapture booted `1.14.0` and the panel read `Installed: 1.14.0 / Latest: 1.13.7 /
 * Up to date.` — the plugin reporting correctly against the PUBLIC feed it watches, but a version pair
 * that reads as nonsense to a store visitor. Following the public line keeps the App row
 * saying `Up to date.` and keeps the shots on current Obsidian chrome.
 *
 * This overrides the `OBSIDIAN_VERSION` escape hatch `obsidian-dev-utils` honours on
 * `integration-tests:desktop`, for this project only: a capture is not a test run, and a screenshot taken
 * against an arbitrary version is the defect above.
 */
const CAPTURE_OBSIDIAN_VERSION = 'public-latest';

const APPIUM_URL = 'http://localhost:4723';

/**
 * This AVD is cold-booted and rarely used, so Obsidian's first layout on it is
 * far slower than on the well-warmed shared one; the 90s default expires while
 * it is still starting up.
 */
const LAYOUT_READY_TIMEOUT_IN_MILLISECONDS = 240_000;

/**
 * The demo-vault button suite. It drives a real desktop Obsidian like the desktop project, but opens
 * a copy of the in-repo `demo-vault/` rather than an empty vault — hence its own `globalSetup` — and
 * needs its own suffix so the desktop project does not also collect it and open it against a vault
 * with no notes in it.
 */
const DEMO_VAULT_TEST_FILES = 'src/**/*.demo-vault.integration.test.ts';

/**
 * One `it` per note runs every button in that note, and each button re-opens the note, walks the
 * preview to find itself and then waits up to 15s for a result. A note with a dozen buttons therefore
 * blows well past the desktop project's 30s default — which fails the whole note with a bare vitest
 * timeout instead of naming the button that actually misbehaved.
 */
const DEMO_VAULT_TIMEOUT_IN_MILLISECONDS = 600_000;

export const config = defineObsidianPluginVitestConfig({
  customProjects(context: ObsidianPluginVitestConfigContext): TestProjectConfiguration[] {
    return [
      {
        test: {
          ...context.desktop,
          environmentOptions: {
            obsidianTransport: {
              obsidianInstallerVersion: CAPTURE_INSTALLER_VERSION,
              obsidianVersion: CAPTURE_OBSIDIAN_VERSION,
              type: 'obsidian-cdp'
            }
          },
          include: [DESKTOP_CAPTURE_TEST_FILES],
          name: 'capture-screenshots:desktop'
        }
      },
      {
        test: {
          ...context.android,
          environmentOptions: {
            obsidianTransport: {
              appiumUrl: APPIUM_URL,
              avdName: SCREENSHOT_AVD_NAME,
              layoutReadyTimeoutInMilliseconds: LAYOUT_READY_TIMEOUT_IN_MILLISECONDS,
              type: 'obsidian-android-appium'
            }
          },
          include: [ANDROID_CAPTURE_TEST_FILES],
          name: 'capture-screenshots:android'
        }
      },
      {
        test: {
          ...context.desktop,
          globalSetup: ['./scripts/demo-vault-global-setup.ts'],
          include: [DEMO_VAULT_TEST_FILES],
          name: 'integration-tests:demo-vault',
          testTimeout: DEMO_VAULT_TIMEOUT_IN_MILLISECONDS
        }
      }
    ];
  }
});

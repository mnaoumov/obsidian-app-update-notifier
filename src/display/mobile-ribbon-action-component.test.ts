import type {
  App as AppOriginal,
  RibbonItem,
  WorkspaceRibbon
} from 'obsidian';

import { noopAsync } from '@mnaoumov/typescript-lib/function';
import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import { waitForAllAsyncOperations } from '@mnaoumov/typescript-test-toolkit/async-operation-tracking';
import { strictProxy } from '@mnaoumov/typescript-test-toolkit/strict-proxy';
import { App } from 'obsidian-test-mocks/obsidian';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { PluginSettingsComponent } from '../settings/plugin-settings-component.ts';
import type { ReleaseStreamStatus } from '../update-check/release-streams.ts';
import type { UpdateCheckerComponent } from '../update-check/update-checker-component.ts';

import { PluginSettings } from '../settings/plugin-settings.ts';
import { ReleaseStreamId } from '../update-check/release-streams.ts';
import {
  MOBILE_RIBBON_ACTION_ICON,
  MOBILE_RIBBON_ACTION_TITLE,
  MobileRibbonActionComponent
} from './mobile-ribbon-action-component.ts';
import { showUpdateDetails } from './update-details-modal.ts';

interface LastResultValue {
  readonly statuses: readonly ReleaseStreamStatus[];
}

vi.mock('./update-details-modal.ts', () => ({
  showUpdateDetails: vi.fn(() => noopAsync())
}));

const PLUGIN_ID = 'app-update-notifier';
const RIBBON_ITEM_ID = `${PLUGIN_ID}:${MOBILE_RIBBON_ACTION_TITLE}`;

let app: AppOriginal;
let settings: PluginSettings;
let lastResult: LastResultValue | null;
let resultListeners: (() => void)[];
let ribbon: FakeRibbon;

/**
 * A ribbon that behaves like Obsidian's own `WorkspaceRibbon` for the three calls the component makes
 * (`app.js:133229-133284`, 1.15.1): adding reuses an entry with the same id, removing deletes only its
 * button and callback, and `onChange` shows the buttons of the entries that are not hidden.
 */
class FakeRibbon {
  public readonly items: RibbonItem[] = [];
  public readonly ribbonItemsEl = createDiv();

  public addRibbonItemButton(id: string, icon: string, title: string, callback: ($event: MouseEvent) => unknown): HTMLElement {
    const buttonEl = createDiv();
    buttonEl.addEventListener('click', ($event) => {
      callback($event);
    });
    let item = this.items.find((candidate) => candidate.id === id);
    if (item) {
      item.callback = callback;
    } else {
      item = { callback, hidden: false, icon, id, title };
      this.items.push(item);
    }
    item.buttonEl = buttonEl;
    this.onChange(false);
    return buttonEl;
  }

  public onChange(_shouldSave: boolean): void {
    const buttons: HTMLElement[] = [];
    for (const item of this.items) {
      if (!item.buttonEl) {
        continue;
      }
      item.buttonEl.toggle(!item.hidden);
      buttons.push(item.buttonEl);
    }
    this.ribbonItemsEl.setChildrenInPlace(buttons);
  }

  public removeRibbonAction(id: string): void {
    for (const item of this.items) {
      if (item.id !== id) {
        continue;
      }
      delete item.buttonEl;
      // Obsidian deletes the callback too, which is what leaves a dead entry in the phone's ribbon menu.
      delete castTo<Partial<RibbonItem>>(item).callback;
    }
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  app = App.createConfigured__().asOriginalType__();
  settings = new PluginSettings();
  lastResult = null;
  resultListeners = [];
  ribbon = new FakeRibbon();
});

describe('the mobile ribbon action', () => {
  it('should not be there before any check has succeeded', () => {
    const component = loadComponent();

    expect(component.isShown).toBe(false);
    expect(ribbon.items).toEqual([]);
  });

  it('should not be there while everything is up to date', () => {
    lastResult = { statuses: [createStatus(ReleaseStreamId.App, false)] };

    const component = loadComponent();

    expect(component.isShown).toBe(false);
    expect(ribbon.items).toEqual([]);
  });

  it('should be there while an update is available, under the plugin-prefixed id', () => {
    lastResult = { statuses: [createStatus(ReleaseStreamId.App, true)] };

    const component = loadComponent();

    expect(component.isShown).toBe(true);
    expect(ribbon.items).toEqual([expect.objectContaining({ hidden: false, icon: MOBILE_RIBBON_ACTION_ICON, id: RIBBON_ITEM_ID, title: MOBILE_RIBBON_ACTION_TITLE })]);
    expect(ribbon.ribbonItemsEl.childElementCount).toBe(1);
  });

  it('should not be there for an update still inside the release wait', () => {
    settings.releaseWaitInDays = 7;
    lastResult = { statuses: [createStatus(ReleaseStreamId.App, true, Date.now())] };

    const component = loadComponent();

    expect(component.isShown).toBe(false);
  });

  it('should not be there when the setting is off', () => {
    settings.shouldShowMobileRibbonAction = false;
    lastResult = { statuses: [createStatus(ReleaseStreamId.App, true)] };

    const component = loadComponent();

    expect(component.isShown).toBe(false);
  });

  it('should appear when a check finds an update, and leave no entry behind once it is gone', () => {
    const component = loadComponent();

    lastResult = { statuses: [createStatus(ReleaseStreamId.App, true)] };
    notifyResult();
    expect(component.isShown).toBe(true);

    lastResult = { statuses: [createStatus(ReleaseStreamId.App, false)] };
    notifyResult();

    expect(component.isShown).toBe(false);
    // The phone's ribbon menu lists every entry in `items` that is not hidden, so the entry itself has to go.
    expect(ribbon.items).toEqual([]);
    expect(ribbon.ribbonItemsEl.childElementCount).toBe(0);
  });

  it('should not add a second button when an update is still there at the next check', () => {
    lastResult = { statuses: [createStatus(ReleaseStreamId.App, true)] };
    loadComponent();
    const addSpy = vi.spyOn(ribbon, 'addRibbonItemButton');

    notifyResult();

    expect(addSpy).not.toHaveBeenCalled();
    expect(ribbon.items).toHaveLength(1);
  });

  it('should keep the reader\'s choice to hide it across a remove and a re-add', () => {
    lastResult = { statuses: [createStatus(ReleaseStreamId.App, true)] };
    loadComponent();
    const firstItem = ribbon.items[0];
    if (!firstItem) {
      throw new Error('The ribbon entry is missing.');
    }
    firstItem.hidden = true;

    lastResult = { statuses: [createStatus(ReleaseStreamId.App, false)] };
    notifyResult();
    lastResult = { statuses: [createStatus(ReleaseStreamId.App, true)] };
    notifyResult();

    expect(ribbon.items).toEqual([expect.objectContaining({ hidden: true, id: RIBBON_ITEM_ID })]);
  });

  it('should open the details panel on click, with the release wait', async () => {
    settings.releaseWaitInDays = 3;
    lastResult = { statuses: [createStatus(ReleaseStreamId.App, true)] };
    loadComponent();

    ribbon.items[0]?.buttonEl?.dispatchEvent(new MouseEvent('click'));
    await waitForAllAsyncOperations();

    expect(showUpdateDetails).toHaveBeenCalledWith({ app, releaseWaitInDays: 3, result: lastResult });
  });

  it('should be taken out on unload, and stay out at a later check', () => {
    lastResult = { statuses: [createStatus(ReleaseStreamId.App, true)] };
    const component = loadComponent();

    component.unload();
    notifyResult();

    expect(component.isShown).toBe(false);
    expect(ribbon.items).toEqual([]);
  });

  it('should do nothing when refreshed before it is loaded', () => {
    lastResult = { statuses: [createStatus(ReleaseStreamId.App, true)] };

    createComponent().refresh();

    expect(ribbon.items).toEqual([]);
  });
});

function createComponent(): MobileRibbonActionComponent {
  return new MobileRibbonActionComponent({
    app,
    getRibbon: () => castTo<WorkspaceRibbon>(ribbon),
    pluginId: PLUGIN_ID,
    pluginSettingsComponent: castTo<PluginSettingsComponent>(strictProxy({
      get settings() {
        return settings;
      }
    })),
    // Not a `strictProxy`: it caches the plain object a getter returns on first read, and these tests
    // replace `lastResult` between checks.
    updateCheckerComponent: castTo<UpdateCheckerComponent>({
      addResultListener: (listener: () => void) => {
        resultListeners.push(listener);
      },
      get lastResult() {
        return lastResult;
      }
    })
  });
}

function createStatus(id: ReleaseStreamId, isUpdateAvailable: boolean, publishedAtInMilliseconds: null | number = null): ReleaseStreamStatus {
  return {
    changelogUrl: 'https://obsidian.md/changelog/',
    currentVersion: '1.13.6',
    id,
    isUpdateAvailable,
    latestVersion: '1.13.7',
    publishedAtInMilliseconds
  };
}

function loadComponent(): MobileRibbonActionComponent {
  const component = createComponent();
  component.load();
  return component;
}

function notifyResult(): void {
  for (const listener of resultListeners) {
    listener();
  }
}

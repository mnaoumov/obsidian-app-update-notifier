/**
 * @file
 *
 * The mobile ribbon action: mobile Obsidian has no status bar, so while a watched stream has an update
 * this puts an action in the left ribbon that opens the details panel, and takes it out again once
 * everything is up to date.
 *
 * The idea comes from `Plugin Update Tracker` (https://github.com/swar8080/obsidian-plugin-update-tracker,
 * MIT), whose mobile ribbon action is shown only while an update is available. No code is copied.
 *
 * ⚠️ The action is REMOVED rather than hidden, and removing it has three halves. On a phone the ribbon
 * is the navbar's ribbon MENU, which `showRibbonMenu` builds from `leftRibbon.items`, skipping only an
 * entry whose `hidden` is set and never checking `buttonEl` (`app.js:143259-143274`, 1.15.1). So a CSS
 * class hides nothing there, and `removeRibbonAction` alone (`app.js:133260`, which deletes only the
 * entry's `buttonEl` and `callback`) leaves an entry in that menu that throws when tapped. Writing
 * `hidden` instead would overwrite the reader's own ribbon choice, which Obsidian saves in the layout.
 * The reader's `hidden` is carried across a remove and a re-add instead, so an action hidden in
 * `Settings → Appearance → Ribbon menu configuration` stays hidden.
 */

import type {
  App,
  RibbonItem,
  WorkspaceRibbon
} from 'obsidian';

import { ComponentEx } from '@mnaoumov/obsidian-lib/components/component-ex';
import { invokeAsyncSafely } from '@mnaoumov/typescript-lib/async';

import type { PluginSettingsComponent } from '../settings/plugin-settings-component.ts';
import type { UpdateCheckerComponent } from '../update-check/update-checker-component.ts';

import { countUpdates } from '../update-check/release-wait.ts';
import { showUpdateDetails } from './update-details-modal.ts';

/**
 * Constructor parameters for {@link MobileRibbonActionComponent}.
 */
export interface MobileRibbonActionComponentConstructorParams {
  /**
   * The Obsidian app instance.
   */
  readonly app: App;

  /**
   * Returns the ribbon the action goes into, `app.workspace.leftRibbon` in the plugin.
   */
  readonly getRibbon: () => WorkspaceRibbon;

  /**
   * The plugin id, which prefixes the ribbon item id the way `Plugin.addRibbonIcon` does.
   */
  readonly pluginId: string;

  /**
   * The settings holder.
   */
  readonly pluginSettingsComponent: PluginSettingsComponent;

  /**
   * The checker whose result decides whether the action is shown.
   */
  readonly updateCheckerComponent: UpdateCheckerComponent;
}

/**
 * The ribbon action's icon.
 */
export const MOBILE_RIBBON_ACTION_ICON = 'lucide-download';

/**
 * The ribbon action's title, which the phone's ribbon menu shows as the entry's text.
 */
export const MOBILE_RIBBON_ACTION_TITLE = 'Obsidian update available';

/**
 * Shows the ribbon action while an update is available, on the platform the plugin adds it on.
 */
export class MobileRibbonActionComponent extends ComponentEx {
  /**
   * Whether the action is in the ribbon right now.
   *
   * @returns `true` while the action is shown.
   */
  public get isShown(): boolean {
    return this.buttonEl !== null;
  }

  private readonly app: App;
  private buttonEl: HTMLElement | null = null;
  private readonly getRibbon: () => WorkspaceRibbon;
  private isActive = false;
  private isHiddenByReader = false;
  private readonly pluginSettingsComponent: PluginSettingsComponent;
  private readonly ribbonItemId: string;

  private readonly updateCheckerComponent: UpdateCheckerComponent;
  /**
   * Creates the component.
   *
   * @param params - The constructor parameters.
   */
  public constructor(params: MobileRibbonActionComponentConstructorParams) {
    super();
    this.app = params.app;
    this.getRibbon = params.getRibbon;
    this.pluginSettingsComponent = params.pluginSettingsComponent;
    this.ribbonItemId = `${params.pluginId}:${MOBILE_RIBBON_ACTION_TITLE}`;
    this.updateCheckerComponent = params.updateCheckerComponent;
  }

  /**
   * Starts following the checker's result.
   */
  public override onload(): void {
    super.onload();
    this.isActive = true;
    this.updateCheckerComponent.addResultListener(this.refresh.bind(this));
    this.refresh();
  }

  /**
   * Takes the action out of the ribbon.
   */
  public override onunload(): void {
    // The checker has no way to drop a listener, so the listener outlives this component and is
    // silenced here instead.
    this.isActive = false;
    this.removeAction();
    super.onunload();
  }

  /**
   * Adds or removes the action from the checker's last result and the current settings.
   */
  public refresh(): void {
    if (!this.isActive) {
      return;
    }

    const settings = this.pluginSettingsComponent.settings;
    const { announcedCount } = countUpdates(this.updateCheckerComponent.lastResult?.statuses ?? [], settings.releaseWaitInDays, Date.now());

    if (settings.shouldShowMobileRibbonAction && announcedCount > 0) {
      this.addAction();
    } else {
      this.removeAction();
    }
  }

  private addAction(): void {
    if (this.buttonEl) {
      return;
    }

    const ribbon = this.getRibbon();
    this.buttonEl = ribbon.addRibbonItemButton(this.ribbonItemId, MOBILE_RIBBON_ACTION_ICON, MOBILE_RIBBON_ACTION_TITLE, () => {
      invokeAsyncSafely(async () => {
        await showUpdateDetails({
          app: this.app,
          releaseWaitInDays: this.pluginSettingsComponent.settings.releaseWaitInDays,
          result: this.updateCheckerComponent.lastResult
        });
      });
    });

    if (!this.isHiddenByReader) {
      return;
    }

    for (const item of this.findItems(ribbon)) {
      item.hidden = true;
    }
    ribbon.onChange(false);
  }

  private findItems(ribbon: WorkspaceRibbon): RibbonItem[] {
    return ribbon.items.filter((item) => item.id === this.ribbonItemId);
  }

  private removeAction(): void {
    const buttonEl = this.buttonEl;
    if (!buttonEl) {
      return;
    }

    this.buttonEl = null;
    const ribbon = this.getRibbon();
    const items = this.findItems(ribbon);
    this.isHiddenByReader = items.some((item) => item.hidden);
    ribbon.removeRibbonAction(this.ribbonItemId);
    buttonEl.detach();
    for (const item of items) {
      ribbon.items.remove(item);
    }
    ribbon.onChange(false);
  }
}

import type { StatusBarItemRegistrar } from '@mnaoumov/obsidian-lib/status-bar-item-registrar';
import type { App } from 'obsidian';

import { ComponentEx } from '@mnaoumov/obsidian-lib/components/component-ex';
import { invokeAsyncSafely } from '@mnaoumov/typescript-lib/async';

import type { PluginSettingsComponent } from '../settings/plugin-settings-component.ts';
import type { UpdateCheckerComponent } from '../update-check/update-checker-component.ts';

import { checkIsReleaseHeld } from '../update-check/release-wait.ts';
import { showUpdateDetails } from './update-details-modal.ts';

interface StatusBarComponentConstructorParams {
  readonly app: App;
  readonly pluginSettingsComponent: PluginSettingsComponent;
  readonly statusBarItemRegistrar: StatusBarItemRegistrar;
  readonly updateCheckerComponent: UpdateCheckerComponent;
}

const STATUS_BAR_CSS_CLASS = 'app-update-notifier-status-bar-item';

export class StatusBarComponent extends ComponentEx {
  private readonly app: App;
  private readonly pluginSettingsComponent: PluginSettingsComponent;
  private statusBarItemEl: HTMLElement | null = null;
  private readonly statusBarItemRegistrar: StatusBarItemRegistrar;
  private readonly updateCheckerComponent: UpdateCheckerComponent;

  public constructor(params: StatusBarComponentConstructorParams) {
    super();
    this.app = params.app;
    this.pluginSettingsComponent = params.pluginSettingsComponent;
    this.statusBarItemRegistrar = params.statusBarItemRegistrar;
    this.updateCheckerComponent = params.updateCheckerComponent;
  }

  public override onload(): void {
    super.onload();

    const statusBarItemEl = this.statusBarItemRegistrar.addStatusBarItem();
    statusBarItemEl.addClass(STATUS_BAR_CSS_CLASS);
    this.registerDomEvent(statusBarItemEl, 'click', () => {
      invokeAsyncSafely(async () => {
        await showUpdateDetails({
          app: this.app,
          releaseWaitInDays: this.pluginSettingsComponent.settings.releaseWaitInDays,
          result: this.updateCheckerComponent.lastResult
        });
      });
    });
    this.statusBarItemEl = statusBarItemEl;

    this.updateCheckerComponent.addResultListener(this.refresh.bind(this));
    this.refresh();
  }

  /**
   * Redraws the item from the checker's last successful result and the current settings.
   */
  public refresh(): void {
    const statusBarItemEl = this.statusBarItemEl;
    if (!statusBarItemEl) {
      return;
    }

    const result = this.updateCheckerComponent.lastResult;
    const shouldShow = this.pluginSettingsComponent.settings.shouldShowStatusBarItem
      // A platform with no watchable stream (iOS) gets no item at all, rather than one that can only
      // ever say "unknown".
      && (result === null || result.statuses.length > 0);

    statusBarItemEl.toggleClass('app-update-notifier-hidden', !shouldShow);
    if (!shouldShow) {
      return;
    }

    // A release inside its wait is not counted, so the count moves when the notice does. The tooltip
    // still says it exists, because the panel the click opens lists it.
    const releaseWaitInDays = this.pluginSettingsComponent.settings.releaseWaitInDays;
    const nowInMilliseconds = Date.now();
    const availableStatuses = result?.statuses.filter((status) => status.isUpdateAvailable) ?? [];
    const heldCount = availableStatuses.filter((status) => checkIsReleaseHeld(status, releaseWaitInDays, nowInMilliseconds)).length;
    const updateCount = availableStatuses.length - heldCount;
    statusBarItemEl.setText(buildText(result === null, updateCount));
    statusBarItemEl.setAttr('aria-label', buildTooltip(result === null, updateCount, heldCount));
    statusBarItemEl.toggleClass('mod-warning', updateCount > 0);
  }
}

function buildText(hasNoResult: boolean, updateCount: number): string {
  if (hasNoResult) {
    return 'Obsidian: not checked';
  }

  if (updateCount === 0) {
    return 'Obsidian: up to date';
  }

  return `Obsidian: ${String(updateCount)} update${updateCount === 1 ? '' : 's'}`;
}

function buildTooltip(hasNoResult: boolean, updateCount: number, heldCount: number): string {
  if (hasNoResult) {
    return 'No update check has succeeded yet. Click for details.';
  }

  if (heldCount > 0) {
    const heldText = heldCount === 1 ? '1 new release is' : `${String(heldCount)} new releases are`;
    return `${heldText} still inside the wait you set. Click for details.`;
  }

  return updateCount === 0 ? 'Every watched Obsidian release stream is up to date. Click for details.' : 'Click for the versions and their changelogs.';
}

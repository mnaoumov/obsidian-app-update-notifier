import type { App } from 'obsidian';

import { GlobalCommandHandler } from 'obsidian-dev-utils/obsidian/command-handlers/global-command-handler';

import type { UpdateCheckerComponent } from './update-checker-component.ts';

import { showUpdateDetails } from './update-details-modal.ts';

/**
 * Constructor parameters for {@link CheckForUpdatesCommandHandler}.
 */
export interface CheckForUpdatesCommandHandlerConstructorParams {
  /**
   * The Obsidian app instance.
   */
  readonly app: App;

  /**
   * The checker to run.
   */
  readonly updateCheckerComponent: UpdateCheckerComponent;
}

/**
 * Checks every watched stream now and shows what it found.
 *
 * The command exists for the case the scheduled check cannot serve: someone who has just heard a
 * release is out and wants an answer immediately, and someone whose last check failed while they were
 * offline. Both want to SEE a result, which is why it opens the details rather than only refreshing
 * the status bar.
 */
export class CheckForUpdatesCommandHandler extends GlobalCommandHandler {
  private readonly app: App;
  private readonly updateCheckerComponent: UpdateCheckerComponent;

  public constructor(params: CheckForUpdatesCommandHandlerConstructorParams) {
    super({
      icon: 'refresh-cw',
      id: 'check-for-updates',
      name: 'Check for updates now'
    });

    this.app = params.app;
    this.updateCheckerComponent = params.updateCheckerComponent;
  }

  public override async execute(): Promise<void> {
    await this.updateCheckerComponent.check(true);
    await showUpdateDetails({ app: this.app, result: this.updateCheckerComponent.lastResult });
  }
}

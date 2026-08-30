import type { App as AppOriginal } from 'obsidian';

import { noopAsync } from 'obsidian-dev-utils/function';
import { castTo } from 'obsidian-dev-utils/object-utils';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import { App } from 'obsidian-test-mocks/obsidian';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { UpdateCheckerComponent } from './update-checker-component.ts';

import { CheckForUpdatesCommandHandler } from './check-for-updates-command-handler.ts';
import { showUpdateDetails } from './update-details-modal.ts';

vi.mock('./update-details-modal.ts', () => ({
  showUpdateDetails: vi.fn(() => noopAsync())
}));

const check = vi.fn(() => noopAsync());
const lastResult = { statuses: [] };

let app: AppOriginal;

beforeEach(() => {
  vi.clearAllMocks();
  app = App.createConfigured__().asOriginalType__();
});

describe('CheckForUpdatesCommandHandler', () => {
  it('should be registered as a global command', () => {
    const command = createHandler().buildCommand();

    expect(command.id).toBe('check-for-updates');
    expect(command.name).toBe('Check for updates now');
  });

  it('should report a failure, unlike the scheduled check', async () => {
    // Someone who has just asked deserves an answer either way; a silent no-op would read as "nothing
    // New", which is a different and possibly wrong answer.
    await createHandler().execute();

    expect(check).toHaveBeenCalledWith(true);
  });

  it('should show what the check found', async () => {
    await createHandler().execute();

    expect(showUpdateDetails).toHaveBeenCalledWith({ app, result: lastResult });
  });
});

function createHandler(): CheckForUpdatesCommandHandler {
  return new CheckForUpdatesCommandHandler({
    app,
    updateCheckerComponent: castTo<UpdateCheckerComponent>(strictProxy({
      check,
      lastResult
    }))
  });
}

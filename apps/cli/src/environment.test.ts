import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { loadLocalEnvironment } from './environment.js';

const testVariable = 'POESYGEN_ENV_FILE_TEST';

afterEach(() => {
  delete process.env[testVariable];
});

describe('CLI environment loading', () => {
  it('silently ignores a missing optional environment file', () => {
    expect(() => loadLocalEnvironment('/path/that/does/not/exist/.env')).not.toThrow();
  });

  it('loads variables from an existing environment file', () => {
    const fixture = fileURLToPath(new URL('./environment.test.txt', import.meta.url));

    loadLocalEnvironment(fixture);

    expect(process.env[testVariable]).toBe('loaded');
  });
});

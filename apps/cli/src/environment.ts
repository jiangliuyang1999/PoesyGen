import { fileURLToPath } from 'node:url';

const defaultEnvironmentPath = fileURLToPath(new URL('../../../.env', import.meta.url));

export function loadLocalEnvironment(path = defaultEnvironmentPath): void {
  try {
    process.loadEnvFile(path);
  } catch (error) {
    if (isMissingFileError(error)) return;
    throw error;
  }
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { readonly code?: unknown }).code === 'ENOENT'
  );
}

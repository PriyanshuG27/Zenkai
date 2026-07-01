/**
 * e2e/global-teardown.ts
 * Runs ONCE after all tests complete.
 * Clears emulator state to leave a clean slate for the next run.
 */

import * as http from 'http';

const EMULATOR_AUTH_URL = 'http://localhost:9099';
const EMULATOR_FIRESTORE_URL = 'http://localhost:8080';
const PROJECT_ID = 'fitdesi-74283';

function emulatorDelete(url: string): Promise<void> {
  return new Promise((resolve) => {
    const parsed = new URL(url);
    const req = http.request(
      { hostname: parsed.hostname, port: parsed.port, path: parsed.pathname, method: 'DELETE' },
      () => resolve(),
    );
    req.on('error', () => resolve()); // ignore — emulator may already be down
    req.end();
  });
}

export default async function globalTeardown() {
  console.log('\n[E2E Teardown] Clearing emulator state...');
  await emulatorDelete(
    `${EMULATOR_AUTH_URL}/emulator/v1/projects/${PROJECT_ID}/accounts`,
  );
  await emulatorDelete(
    `${EMULATOR_FIRESTORE_URL}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
  );
  console.log('[E2E Teardown] Done.\n');
}

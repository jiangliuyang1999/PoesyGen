import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema.js';

export * from './schema.js';

export function createDatabase(connectionString: string) {
  const client = postgres(connectionString, {
    max: 10,
    prepare: false,
  });
  const db = drizzle(client, { schema });

  return {
    db,
    close: async (): Promise<void> => {
      await client.end();
    },
  };
}

export type Database = ReturnType<typeof createDatabase>['db'];

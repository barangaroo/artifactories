import "server-only";

import { Pool, type PoolClient, type QueryResultRow } from "pg";

declare global {
  var __artifactoriesPool: Pool | undefined;
}

export function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

function createPool(): Pool {
  const sslMode = process.env.DATABASE_SSL?.toLowerCase();
  const defaultPoolSize = process.env.VERCEL ? 1 : 5;
  const configuredPoolSize = Number(process.env.DATABASE_POOL_MAX ?? defaultPoolSize);
  const max = Number.isFinite(configuredPoolSize)
    ? Math.min(10, Math.max(1, Math.floor(configuredPoolSize)))
    : defaultPoolSize;
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    max,
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 8_000,
    ssl:
      sslMode === "disable"
        ? false
        : sslMode === "require"
          ? { rejectUnauthorized: false }
          : undefined,
  });
}

export function getPool(): Pool {
  if (!hasDatabase()) throw new Error("storage_not_configured");
  globalThis.__artifactoriesPool ??= createPool();
  return globalThis.__artifactoriesPool;
}

export async function withTransaction<T>(
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function query<T extends QueryResultRow>(
  text: string,
  values: unknown[] = [],
) {
  return getPool().query<T>(text, values);
}

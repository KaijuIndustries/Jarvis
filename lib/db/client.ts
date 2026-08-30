import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";
import { serverConfig } from "@/lib/config";

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!serverConfig.databaseUrl) {
    throw new Error("DATABASE_URL is not configured");
  }
  if (!pool) {
    pool = new Pool({
      connectionString: serverConfig.databaseUrl,
      max: 8,
    });
  }
  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values?: unknown[],
): Promise<QueryResult<T>> {
  return getPool().query<T>(text, values);
}

export async function withClient<T>(
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    return await work(client);
  } finally {
    client.release();
  }
}

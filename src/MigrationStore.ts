import { Pool, PoolClient } from "pg";
import { MigrationRecord } from "./types";

const MIGRATIONS_TABLE = "_migrations";

export class MigrationStore {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      host: process.env.DB_HOST || "localhost",
      port: parseInt(process.env.DB_PORT || "5432"),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    });
  }

  async initialize(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
        version VARCHAR(14) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        execution_time_ms INTEGER NOT NULL DEFAULT 0,
        checksum VARCHAR(32) NOT NULL
      )
    `);
  }

  async getApplied(): Promise<MigrationRecord[]> {
    const result = await this.pool.query(
      `SELECT version, name, applied_at, execution_time_ms, checksum
       FROM ${MIGRATIONS_TABLE}
       ORDER BY version ASC`
    );

    return result.rows.map((row) => ({
      version: row.version,
      name: row.name,
      appliedAt: row.applied_at,
      executionTimeMs: row.execution_time_ms,
      checksum: row.checksum,
    }));
  }

  async getPending(allVersions: string[]): Promise<string[]> {
    const applied = await this.getApplied();
    const appliedSet = new Set(applied.map((a) => a.version));
    return allVersions.filter((v) => !appliedSet.has(v));
  }

  async record(migration: MigrationRecord, client?: PoolClient): Promise<void> {
    const conn = client || this.pool;
    await conn.query(
      `INSERT INTO ${MIGRATIONS_TABLE} (version, name, applied_at, execution_time_ms, checksum)
       VALUES ($1, $2, $3, $4, $5)`,
      [migration.version, migration.name, migration.appliedAt, migration.executionTimeMs, migration.checksum]
    );
  }

  async remove(version: string, client?: PoolClient): Promise<void> {
    const conn = client || this.pool;
    await conn.query(`DELETE FROM ${MIGRATIONS_TABLE} WHERE version = $1`, [version]);
  }

  async getHistory(limit: number = 20): Promise<MigrationRecord[]> {
    const result = await this.pool.query(
      `SELECT version, name, applied_at, execution_time_ms, checksum
       FROM ${MIGRATIONS_TABLE}
       ORDER BY applied_at DESC
       LIMIT $1`,
      [limit]
    );

    return result.rows.map((row) => ({
      version: row.version,
      name: row.name,
      appliedAt: row.applied_at,
      executionTimeMs: row.execution_time_ms,
      checksum: row.checksum,
    }));
  }

  async runInTransaction(fn: (client: PoolClient) => Promise<void>): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await fn(client);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async acquireLock(lockId: number): Promise<boolean> {
    const result = await this.pool.query("SELECT pg_try_advisory_lock($1) AS acquired", [lockId]);
    return result.rows[0].acquired;
  }

  async releaseLock(lockId: number): Promise<void> {
    await this.pool.query("SELECT pg_advisory_unlock($1)", [lockId]);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

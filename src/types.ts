export interface Migration {
  version: string;
  name: string;
  up: string | (() => Promise<void>);
  down: string | (() => Promise<void>);
}

export interface MigrationFile {
  version: string;
  name: string;
  filename: string;
  filepath: string;
  format: "sql" | "js";
}

export interface MigrationRecord {
  version: string;
  name: string;
  appliedAt: Date;
  executionTimeMs: number;
  checksum: string;
}

export type MigrationStatus = "pending" | "applied" | "missing";

export interface MigrationInfo {
  version: string;
  name: string;
  status: MigrationStatus;
  appliedAt?: Date;
}

export interface DBConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
  connectionString?: string;
}

export interface SeedConfig {
  truncateFirst: boolean;
  order?: string[];
  tables?: string[];
}

export type ColumnType =
  | "varchar"
  | "text"
  | "integer"
  | "bigint"
  | "smallint"
  | "decimal"
  | "float"
  | "boolean"
  | "date"
  | "timestamp"
  | "timestamptz"
  | "json"
  | "jsonb"
  | "uuid"
  | "serial"
  | "bigserial";

export interface ColumnDefinition {
  name: string;
  type: ColumnType;
  length?: number;
  precision?: number;
  scale?: number;
  nullable: boolean;
  defaultValue?: string | number | boolean | null;
  primaryKey: boolean;
  unique: boolean;
  references?: { table: string; column: string; onDelete?: string; onUpdate?: string };
}

export interface IndexDefinition {
  name: string;
  table: string;
  columns: string[];
  unique: boolean;
  where?: string;
}

export interface TableDefinition {
  name: string;
  columns: ColumnDefinition[];
  indexes: IndexDefinition[];
  primaryKey?: string[];
}

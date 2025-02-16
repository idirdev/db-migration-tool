import * as fs from "fs";
import * as path from "path";

export class MigrationGenerator {
  private migrationsDir: string;

  constructor(migrationsDir: string) {
    this.migrationsDir = path.resolve(migrationsDir);
  }

  async create(name: string, format: "sql" | "js" = "sql"): Promise<string> {
    this.ensureDirectoryExists();
    const version = this.generateVersion();
    const sanitizedName = this.sanitizeName(name);
    const filename = `${version}_${sanitizedName}.${format}`;
    const filepath = path.join(this.migrationsDir, filename);

    const content = format === "sql" ? this.sqlTemplate(sanitizedName) : this.jsTemplate(sanitizedName);

    fs.writeFileSync(filepath, content, "utf-8");
    return filepath;
  }

  async createTable(tableName: string, format: "sql" | "js" = "sql"): Promise<string> {
    this.ensureDirectoryExists();
    const version = this.generateVersion();
    const name = `create_${tableName}`;
    const filename = `${version}_${name}.${format}`;
    const filepath = path.join(this.migrationsDir, filename);

    const content = format === "sql" ? this.createTableTemplate(tableName) : this.jsCreateTableTemplate(tableName);
    fs.writeFileSync(filepath, content, "utf-8");
    return filepath;
  }

  async addColumn(tableName: string, columnName: string, columnType: string): Promise<string> {
    this.ensureDirectoryExists();
    const version = this.generateVersion();
    const name = `add_${columnName}_to_${tableName}`;
    const filename = `${version}_${name}.sql`;
    const filepath = path.join(this.migrationsDir, filename);

    const content = [
      "-- @up",
      `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType};`,
      "",
      "-- @down",
      `ALTER TABLE ${tableName} DROP COLUMN ${columnName};`,
    ].join("\n");

    fs.writeFileSync(filepath, content, "utf-8");
    return filepath;
  }

  async addIndex(tableName: string, columns: string[], unique: boolean = false): Promise<string> {
    this.ensureDirectoryExists();
    const version = this.generateVersion();
    const colNames = columns.join("_");
    const indexName = `idx_${tableName}_${colNames}`;
    const name = `add_index_${colNames}_on_${tableName}`;
    const filename = `${version}_${name}.sql`;
    const filepath = path.join(this.migrationsDir, filename);

    const uniqueStr = unique ? "UNIQUE " : "";
    const content = [
      "-- @up",
      `CREATE ${uniqueStr}INDEX ${indexName} ON ${tableName} (${columns.join(", ")});`,
      "",
      "-- @down",
      `DROP INDEX ${indexName};`,
    ].join("\n");

    fs.writeFileSync(filepath, content, "utf-8");
    return filepath;
  }

  private sqlTemplate(name: string): string {
    return [
      `-- Migration: ${name}`,
      `-- Created at: ${new Date().toISOString()}`,
      "",
      "-- @up",
      `-- Write your UP migration SQL here`,
      "",
      "",
      "-- @down",
      `-- Write your DOWN migration SQL here`,
      "",
    ].join("\n");
  }

  private jsTemplate(name: string): string {
    return [
      `// Migration: ${name}`,
      `// Created at: ${new Date().toISOString()}`,
      "",
      "module.exports = {",
      "  async up(client) {",
      '    await client.query(`',
      "      -- Write your UP migration SQL here",
      "    `);",
      "  },",
      "",
      "  async down(client) {",
      '    await client.query(`',
      "      -- Write your DOWN migration SQL here",
      "    `);",
      "  },",
      "};",
      "",
    ].join("\n");
  }

  private createTableTemplate(tableName: string): string {
    return [
      `-- Migration: create_${tableName}`,
      `-- Created at: ${new Date().toISOString()}`,
      "",
      "-- @up",
      `CREATE TABLE ${tableName} (`,
      "  id SERIAL PRIMARY KEY,",
      "  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),",
      "  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
      ");",
      "",
      "-- @down",
      `DROP TABLE IF EXISTS ${tableName};`,
      "",
    ].join("\n");
  }

  private jsCreateTableTemplate(tableName: string): string {
    return [
      `// Migration: create_${tableName}`,
      `// Created at: ${new Date().toISOString()}`,
      "",
      "module.exports = {",
      "  async up(client) {",
      "    await client.query(`",
      `      CREATE TABLE ${tableName} (`,
      "        id SERIAL PRIMARY KEY,",
      "        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),",
      "        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
      "      );",
      "    `);",
      "  },",
      "",
      "  async down(client) {",
      "    await client.query(`",
      `      DROP TABLE IF EXISTS ${tableName};`,
      "    `);",
      "  },",
      "};",
      "",
    ].join("\n");
  }

  private generateVersion(): string {
    const now = new Date();
    return [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
      String(now.getHours()).padStart(2, "0"),
      String(now.getMinutes()).padStart(2, "0"),
      String(now.getSeconds()).padStart(2, "0"),
    ].join("");
  }

  private sanitizeName(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  }

  private ensureDirectoryExists(): void {
    if (!fs.existsSync(this.migrationsDir)) {
      fs.mkdirSync(this.migrationsDir, { recursive: true });
    }
  }
}

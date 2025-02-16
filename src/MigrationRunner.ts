import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { MigrationFile, MigrationInfo, MigrationRecord } from "./types";
import { MigrationStore } from "./MigrationStore";

export class MigrationRunner {
  private migrationsDir: string;
  private store: MigrationStore;
  private lockId = 123456;

  constructor(migrationsDir: string) {
    this.migrationsDir = path.resolve(migrationsDir);
    this.store = new MigrationStore();
  }

  async up(steps?: number): Promise<number> {
    await this.store.initialize();
    await this.acquireLock();

    try {
      const pending = await this.getPendingMigrations();
      const toApply = steps ? pending.slice(0, steps) : pending;

      let applied = 0;
      for (const migration of toApply) {
        const startTime = Date.now();
        const content = this.readMigrationFile(migration, "up");
        const checksum = this.calculateChecksum(content);

        console.log(`Applying: ${migration.version}_${migration.name}`);

        await this.store.runInTransaction(async (client) => {
          if (migration.format === "sql") {
            await client.query(content);
          } else {
            const mod = require(migration.filepath);
            await mod.up(client);
          }

          const record: MigrationRecord = {
            version: migration.version,
            name: migration.name,
            appliedAt: new Date(),
            executionTimeMs: Date.now() - startTime,
            checksum,
          };
          await this.store.record(record, client);
        });

        console.log(`  Applied in ${Date.now() - startTime}ms`);
        applied++;
      }

      return applied;
    } finally {
      await this.releaseLock();
    }
  }

  async down(steps: number = 1): Promise<number> {
    await this.store.initialize();
    await this.acquireLock();

    try {
      const applied = await this.store.getApplied();
      const toRevert = applied.slice(-steps).reverse();

      let reverted = 0;
      for (const record of toRevert) {
        const migrationFile = this.findMigrationFile(record.version);
        if (!migrationFile) {
          console.warn(`Warning: migration file not found for ${record.version}_${record.name}`);
          continue;
        }

        const content = this.readMigrationFile(migrationFile, "down");
        console.log(`Reverting: ${record.version}_${record.name}`);

        const startTime = Date.now();
        await this.store.runInTransaction(async (client) => {
          if (migrationFile.format === "sql") {
            await client.query(content);
          } else {
            const mod = require(migrationFile.filepath);
            await mod.down(client);
          }
          await this.store.remove(record.version, client);
        });

        console.log(`  Reverted in ${Date.now() - startTime}ms`);
        reverted++;
      }

      return reverted;
    } finally {
      await this.releaseLock();
    }
  }

  async reset(): Promise<number> {
    const applied = await this.store.getApplied();
    return this.down(applied.length);
  }

  async status(): Promise<void> {
    await this.store.initialize();
    const migrations = await this.getAllMigrationInfo();

    console.log("\nMigration Status:");
    console.log("─".repeat(70));
    console.log(
      "Version".padEnd(16) + "Name".padEnd(30) + "Status".padEnd(12) + "Applied At"
    );
    console.log("─".repeat(70));

    for (const m of migrations) {
      const status = m.status === "applied" ? "APPLIED" : m.status === "pending" ? "PENDING" : "MISSING";
      const appliedAt = m.appliedAt ? m.appliedAt.toISOString().slice(0, 19) : "-";
      console.log(
        m.version.padEnd(16) + m.name.padEnd(30) + status.padEnd(12) + appliedAt
      );
    }

    console.log("─".repeat(70));
    const pending = migrations.filter((m) => m.status === "pending");
    console.log(`\nTotal: ${migrations.length} | Applied: ${migrations.length - pending.length} | Pending: ${pending.length}\n`);
  }

  private async getPendingMigrations(): Promise<MigrationFile[]> {
    const allFiles = this.scanMigrationFiles();
    const applied = await this.store.getApplied();
    const appliedVersions = new Set(applied.map((a) => a.version));
    return allFiles.filter((f) => !appliedVersions.has(f.version));
  }

  private async getAllMigrationInfo(): Promise<MigrationInfo[]> {
    const allFiles = this.scanMigrationFiles();
    const applied = await this.store.getApplied();
    const appliedMap = new Map(applied.map((a) => [a.version, a]));

    return allFiles.map((f) => {
      const record = appliedMap.get(f.version);
      return {
        version: f.version,
        name: f.name,
        status: record ? "applied" : "pending",
        appliedAt: record?.appliedAt,
      };
    });
  }

  private scanMigrationFiles(): MigrationFile[] {
    if (!fs.existsSync(this.migrationsDir)) return [];

    return fs
      .readdirSync(this.migrationsDir)
      .filter((f) => /^\d{14}_/.test(f) && (f.endsWith(".sql") || f.endsWith(".js")))
      .sort()
      .map((filename) => {
        const match = filename.match(/^(\d{14})_(.+)\.(sql|js)$/);
        if (!match) throw new Error(`Invalid migration filename: ${filename}`);
        return {
          version: match[1],
          name: match[2],
          filename,
          filepath: path.join(this.migrationsDir, filename),
          format: match[3] as "sql" | "js",
        };
      });
  }

  private findMigrationFile(version: string): MigrationFile | undefined {
    return this.scanMigrationFiles().find((f) => f.version === version);
  }

  private readMigrationFile(file: MigrationFile, direction: "up" | "down"): string {
    const content = fs.readFileSync(file.filepath, "utf-8");
    if (file.format === "js") return content;

    const sections = content.split(/^-- @(up|down)\s*$/m);
    const dirIndex = sections.findIndex((s, i) => i > 0 && sections[i - 1].trim() === direction);
    if (dirIndex === -1) throw new Error(`Missing @${direction} section in ${file.filename}`);
    return sections[dirIndex].trim();
  }

  private calculateChecksum(content: string): string {
    return crypto.createHash("md5").update(content).digest("hex");
  }

  private async acquireLock(): Promise<void> {
    const acquired = await this.store.acquireLock(this.lockId);
    if (!acquired) throw new Error("Could not acquire migration lock. Another migration may be running.");
  }

  private async releaseLock(): Promise<void> {
    await this.store.releaseLock(this.lockId);
  }
}

import * as fs from "fs";
import * as path from "path";
import { Pool } from "pg";
import { SeedConfig } from "./types";

interface SeedFile {
  name: string;
  filepath: string;
  order: number;
}

export class Seeder {
  private seedsDir: string;
  private pool: Pool;

  constructor(seedsDir: string) {
    this.seedsDir = path.resolve(seedsDir);
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
  }

  async run(config: SeedConfig = { truncateFirst: false }): Promise<void> {
    const seedFiles = this.scanSeedFiles(config.order);

    if (seedFiles.length === 0) {
      console.log("No seed files found.");
      return;
    }

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      for (const seedFile of seedFiles) {
        console.log(`Seeding: ${seedFile.name}`);

        const mod = require(seedFile.filepath);

        if (config.truncateFirst && mod.table) {
          console.log(`  Truncating ${mod.table}...`);
          await client.query(`TRUNCATE TABLE ${mod.table} CASCADE`);
        }

        if (typeof mod.seed === "function") {
          await mod.seed(client, { generate: this.generateData.bind(this) });
        } else if (mod.data && mod.table) {
          await this.insertData(client, mod.table, mod.data);
        }
      }

      await client.query("COMMIT");
      console.log(`\nSeeded ${seedFiles.length} file(s) successfully.`);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  private async insertData(client: any, table: string, data: Record<string, any>[]): Promise<void> {
    if (data.length === 0) return;

    const columns = Object.keys(data[0]);
    const placeholders = data.map(
      (_, rowIdx) =>
        `(${columns.map((_, colIdx) => `$${rowIdx * columns.length + colIdx + 1}`).join(", ")})`
    );
    const values = data.flatMap((row) => columns.map((col) => row[col]));

    await client.query(
      `INSERT INTO ${table} (${columns.join(", ")}) VALUES ${placeholders.join(", ")}`,
      values
    );

    console.log(`  Inserted ${data.length} rows into ${table}`);
  }

  generateData(type: string, count: number = 1): any[] {
    const generators: Record<string, () => any> = {
      name: () => {
        const first = ["Alice", "Bob", "Charlie", "Diana", "Eve", "Frank", "Grace", "Hank"];
        const last = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller"];
        return `${first[Math.floor(Math.random() * first.length)]} ${last[Math.floor(Math.random() * last.length)]}`;
      },
      email: () => {
        const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
        const local = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
        const domains = ["example.com", "test.org", "demo.net"];
        return `${local}@${domains[Math.floor(Math.random() * domains.length)]}`;
      },
      uuid: () => {
        return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
        });
      },
      integer: () => Math.floor(Math.random() * 10000),
      boolean: () => Math.random() > 0.5,
      date: () => new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      text: () => {
        const words = ["lorem", "ipsum", "dolor", "sit", "amet", "consectetur", "adipiscing", "elit"];
        const len = 5 + Math.floor(Math.random() * 15);
        return Array.from({ length: len }, () => words[Math.floor(Math.random() * words.length)]).join(" ");
      },
    };

    const generator = generators[type];
    if (!generator) throw new Error(`Unknown data type: ${type}`);
    return Array.from({ length: count }, generator);
  }

  private scanSeedFiles(order?: string[]): SeedFile[] {
    if (!fs.existsSync(this.seedsDir)) return [];

    const files = fs
      .readdirSync(this.seedsDir)
      .filter((f) => f.endsWith(".js") || f.endsWith(".ts"))
      .map((filename, index) => ({
        name: filename,
        filepath: path.join(this.seedsDir, filename),
        order: order ? order.indexOf(filename.replace(/\.\w+$/, "")) : index,
      }))
      .filter((f) => f.order !== -1 || !order)
      .sort((a, b) => a.order - b.order);

    return files;
  }
}

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// ---------------------------------------------------------------------------
// We mock the MigrationStore so no real DB connection is needed.
// ---------------------------------------------------------------------------

vi.mock("../src/MigrationStore", () => {
  const MigrationStore = vi.fn();
  MigrationStore.prototype.initialize = vi.fn();
  MigrationStore.prototype.getApplied = vi.fn();
  MigrationStore.prototype.getPending = vi.fn();
  MigrationStore.prototype.record = vi.fn();
  MigrationStore.prototype.remove = vi.fn();
  MigrationStore.prototype.acquireLock = vi.fn();
  MigrationStore.prototype.releaseLock = vi.fn();
  MigrationStore.prototype.runInTransaction = vi.fn();
  MigrationStore.prototype.close = vi.fn();
  return { MigrationStore };
});

import { MigrationRunner, deriveLockId } from "../src/MigrationRunner";
import { MigrationStore } from "../src/MigrationStore";
import { MigrationRecord } from "../src/types";

// ---------------------------------------------------------------------------
// Default mock implementations — call this in beforeEach after clearAllMocks
// ---------------------------------------------------------------------------

function setupDefaultMocks() {
  (MigrationStore.prototype.initialize as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  (MigrationStore.prototype.getApplied as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (MigrationStore.prototype.getPending as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (MigrationStore.prototype.record as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  (MigrationStore.prototype.remove as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  (MigrationStore.prototype.acquireLock as ReturnType<typeof vi.fn>).mockResolvedValue(true);
  (MigrationStore.prototype.releaseLock as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  (MigrationStore.prototype.close as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  (MigrationStore.prototype.runInTransaction as ReturnType<typeof vi.fn>).mockImplementation(
    async (fn: (client: any) => Promise<void>) => {
      const fakeClient = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      await fn(fakeClient);
    }
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "runner-test-"));
}

function writeSqlMigration(dir: string, version: string, name: string, up: string, down: string): void {
  const filename = `${version}_${name}.sql`;
  const content = `-- @up\n${up}\n\n-- @down\n${down}\n`;
  fs.writeFileSync(path.join(dir, filename), content, "utf-8");
}

function makeRecord(version: string, name: string = "test"): MigrationRecord {
  return {
    version,
    name,
    appliedAt: new Date(),
    executionTimeMs: 10,
    checksum: "abc123",
  };
}

// ---------------------------------------------------------------------------
// deriveLockId
// ---------------------------------------------------------------------------

describe("deriveLockId", () => {
  it("returns a number", () => {
    expect(typeof deriveLockId("_migrations")).toBe("number");
  });

  it("is deterministic — same input gives same output", () => {
    expect(deriveLockId("_migrations")).toBe(deriveLockId("_migrations"));
  });

  it("different inputs produce different IDs", () => {
    expect(deriveLockId("_migrations")).not.toBe(deriveLockId("_schema_migrations"));
  });

  it("result fits in a signed 32-bit integer", () => {
    const id = deriveLockId("_migrations");
    expect(id).toBeGreaterThanOrEqual(-2147483648);
    expect(id).toBeLessThanOrEqual(2147483647);
  });
});

// ---------------------------------------------------------------------------
// MigrationRunner.up()
// ---------------------------------------------------------------------------

describe("MigrationRunner.up()", () => {
  let dir: string;

  beforeEach(() => {
    dir = tmpDir();
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("returns 0 when no migration files exist", async () => {
    const runner = new MigrationRunner(dir);
    const applied = await runner.up();
    expect(applied).toBe(0);
  });

  it("applies all pending migrations and returns the count", async () => {
    writeSqlMigration(dir, "20240101000000", "create_users", "CREATE TABLE users (id SERIAL);", "DROP TABLE users;");
    writeSqlMigration(dir, "20240101000001", "create_posts", "CREATE TABLE posts (id SERIAL);", "DROP TABLE posts;");

    const runner = new MigrationRunner(dir);
    const applied = await runner.up();
    expect(applied).toBe(2);
  });

  it("respects the `steps` parameter", async () => {
    writeSqlMigration(dir, "20240101000000", "m1", "SELECT 1;", "SELECT 0;");
    writeSqlMigration(dir, "20240101000001", "m2", "SELECT 2;", "SELECT 0;");
    writeSqlMigration(dir, "20240101000002", "m3", "SELECT 3;", "SELECT 0;");

    const runner = new MigrationRunner(dir);
    const applied = await runner.up(2);
    expect(applied).toBe(2);
  });

  it("skips already-applied migrations", async () => {
    writeSqlMigration(dir, "20240101000000", "m1", "SELECT 1;", "SELECT 0;");
    writeSqlMigration(dir, "20240101000001", "m2", "SELECT 2;", "SELECT 0;");

    // Simulate m1 already applied
    (MigrationStore.prototype.getApplied as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeRecord("20240101000000", "m1"),
    ]);

    const runner = new MigrationRunner(dir);
    const applied = await runner.up();
    expect(applied).toBe(1);
  });

  it("acquires and releases the advisory lock", async () => {
    const runner = new MigrationRunner(dir);
    await runner.up();
    expect(MigrationStore.prototype.acquireLock).toHaveBeenCalledOnce();
    expect(MigrationStore.prototype.releaseLock).toHaveBeenCalledOnce();
  });

  it("throws when advisory lock cannot be acquired", async () => {
    (MigrationStore.prototype.acquireLock as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    const runner = new MigrationRunner(dir);
    await expect(runner.up()).rejects.toThrow(/lock/i);
  });

  it("releases lock even when migration throws", async () => {
    writeSqlMigration(dir, "20240101000000", "m1", "SELECT 1;", "SELECT 0;");

    (MigrationStore.prototype.runInTransaction as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("DB error"));

    const runner = new MigrationRunner(dir);
    await expect(runner.up()).rejects.toThrow("DB error");
    expect(MigrationStore.prototype.releaseLock).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// MigrationRunner.down()
// ---------------------------------------------------------------------------

describe("MigrationRunner.down()", () => {
  let dir: string;

  beforeEach(() => {
    dir = tmpDir();
    vi.clearAllMocks();
    setupDefaultMocks();
    // Two migrations applied by default
    (MigrationStore.prototype.getApplied as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeRecord("20240101000000", "m1"),
      makeRecord("20240101000001", "m2"),
    ]);
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("reverts the last 1 migration by default", async () => {
    writeSqlMigration(dir, "20240101000000", "m1", "CREATE TABLE m1 (id INT);", "DROP TABLE m1;");
    writeSqlMigration(dir, "20240101000001", "m2", "CREATE TABLE m2 (id INT);", "DROP TABLE m2;");

    const runner = new MigrationRunner(dir);
    const reverted = await runner.down();
    expect(reverted).toBe(1);
  });

  it("reverts multiple migrations when steps>1", async () => {
    writeSqlMigration(dir, "20240101000000", "m1", "CREATE TABLE m1 (id INT);", "DROP TABLE m1;");
    writeSqlMigration(dir, "20240101000001", "m2", "CREATE TABLE m2 (id INT);", "DROP TABLE m2;");

    const runner = new MigrationRunner(dir);
    const reverted = await runner.down(2);
    expect(reverted).toBe(2);
  });

  it("skips missing migration files with a warning", async () => {
    // m1 file exists on disk, but m2 does NOT → should warn and skip m2
    writeSqlMigration(dir, "20240101000000", "m1", "SELECT 1;", "SELECT 0;");
    // 20240101000001_m2.sql intentionally NOT created

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const runner = new MigrationRunner(dir);
    const reverted = await runner.down(2);
    expect(reverted).toBe(1); // only m1 was actually reverted
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("reverts in reverse chronological order (newest first)", async () => {
    writeSqlMigration(dir, "20240101000000", "m1", "SELECT 1;", "SELECT 0;");
    writeSqlMigration(dir, "20240101000001", "m2", "SELECT 2;", "SELECT 0;");

    const removedVersions: string[] = [];
    (MigrationStore.prototype.remove as ReturnType<typeof vi.fn>).mockImplementation(
      async (version: string) => { removedVersions.push(version); }
    );

    const runner = new MigrationRunner(dir);
    await runner.down(2);

    expect(removedVersions[0]).toBe("20240101000001"); // newest first
    expect(removedVersions[1]).toBe("20240101000000");
  });

  it("releases lock after reverting", async () => {
    writeSqlMigration(dir, "20240101000000", "m1", "SELECT 1;", "SELECT 0;");
    writeSqlMigration(dir, "20240101000001", "m2", "SELECT 2;", "SELECT 0;");

    const runner = new MigrationRunner(dir);
    await runner.down(2);
    expect(MigrationStore.prototype.releaseLock).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// MigrationRunner.reset()
// ---------------------------------------------------------------------------

describe("MigrationRunner.reset()", () => {
  let dir: string;

  beforeEach(() => {
    dir = tmpDir();
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("reverts all applied migrations", async () => {
    writeSqlMigration(dir, "20240101000000", "m1", "SELECT 1;", "SELECT 0;");
    writeSqlMigration(dir, "20240101000001", "m2", "SELECT 2;", "SELECT 0;");
    writeSqlMigration(dir, "20240101000002", "m3", "SELECT 3;", "SELECT 0;");

    (MigrationStore.prototype.getApplied as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeRecord("20240101000000", "m1"),
      makeRecord("20240101000001", "m2"),
      makeRecord("20240101000002", "m3"),
    ]);

    const runner = new MigrationRunner(dir);
    const reverted = await runner.reset();
    expect(reverted).toBe(3);
  });

  it("returns 0 when no migrations are applied", async () => {
    (MigrationStore.prototype.getApplied as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const runner = new MigrationRunner(dir);
    const reverted = await runner.reset();
    expect(reverted).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// MigrationRunner — SQL file parsing (readMigrationFile via up())
// ---------------------------------------------------------------------------

describe("MigrationRunner SQL file parsing", () => {
  let dir: string;

  beforeEach(() => {
    dir = tmpDir();
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("correctly reads the @up section of a SQL migration", async () => {
    const upSQL = "CREATE TABLE parsed_test (id SERIAL PRIMARY KEY);";
    writeSqlMigration(dir, "20240101000000", "parse_test", upSQL, "DROP TABLE parsed_test;");

    // Capture what SQL was executed
    let executedSQL: string | undefined;
    (MigrationStore.prototype.runInTransaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (fn: (client: any) => Promise<void>) => {
        const fakeClient = {
          query: vi.fn().mockImplementation((sql: string) => {
            executedSQL = sql;
            return Promise.resolve({ rows: [] });
          }),
        };
        await fn(fakeClient);
      }
    );

    const runner = new MigrationRunner(dir);
    await runner.up();
    expect(executedSQL).toContain(upSQL);
  });

  it("throws when @up section is missing from SQL file", async () => {
    const badContent = "-- just a comment, no @up marker\nSELECT 1;\n";
    const filename = "20240101000000_bad.sql";
    fs.writeFileSync(path.join(dir, filename), badContent, "utf-8");

    const runner = new MigrationRunner(dir);
    await expect(runner.up()).rejects.toThrow(/@up/);
  });
});

// ---------------------------------------------------------------------------
// MigrationRunner — scanMigrationFiles (via up() with empty dir)
// ---------------------------------------------------------------------------

describe("MigrationRunner scanMigrationFiles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it("returns 0 pending for a non-existent migrations directory", async () => {
    const runner = new MigrationRunner("/tmp/does-not-exist-xyz");
    const applied = await runner.up();
    expect(applied).toBe(0);
  });

  it("ignores files that don't match the 14-digit version pattern", async () => {
    const dir = tmpDir();
    try {
      fs.writeFileSync(path.join(dir, "README.md"), "not a migration", "utf-8");
      fs.writeFileSync(path.join(dir, "1234_too_short.sql"), "-- @up\nSELECT 1;\n-- @down\nSELECT 0;\n", "utf-8");

      const runner = new MigrationRunner(dir);
      const applied = await runner.up();
      expect(applied).toBe(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

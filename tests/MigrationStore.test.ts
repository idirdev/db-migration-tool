import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// MigrationStore wraps `pg.Pool` directly — we mock the entire `pg` module
// so no real database connection is needed.
// ---------------------------------------------------------------------------

const mockQuery = vi.fn();
const mockConnect = vi.fn();
const mockEnd = vi.fn();
const mockRelease = vi.fn();

vi.mock("pg", () => {
  class Pool {
    query: typeof mockQuery;
    connect: typeof mockConnect;
    end: typeof mockEnd;
    constructor() {
      this.query = mockQuery;
      this.connect = mockConnect;
      this.end = mockEnd;
    }
  }
  return { Pool };
});

import { MigrationStore } from "../src/MigrationStore";
import { MigrationRecord } from "../src/types";

function makeRecord(overrides: Partial<MigrationRecord> = {}): MigrationRecord {
  return {
    version: "20240101000000",
    name: "create_users",
    appliedAt: new Date("2024-01-01T00:00:00Z"),
    executionTimeMs: 42,
    checksum: "deadbeef",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------

describe("MigrationStore.initialize()", () => {
  beforeEach(() => vi.clearAllMocks());

  it("runs a CREATE TABLE IF NOT EXISTS query", async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const store = new MigrationStore();
    await store.initialize();
    expect(mockQuery).toHaveBeenCalledOnce();
    const sql: string = mockQuery.mock.calls[0][0];
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS/i);
    expect(sql).toContain("_migrations");
  });
});

describe("MigrationStore.getApplied()", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns an empty array when no rows are present", async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const store = new MigrationStore();
    const result = await store.getApplied();
    expect(result).toEqual([]);
  });

  it("maps DB rows to MigrationRecord shape", async () => {
    const appliedAt = new Date("2024-01-01T00:00:00Z");
    mockQuery.mockResolvedValue({
      rows: [
        {
          version: "20240101000000",
          name: "create_users",
          applied_at: appliedAt,
          execution_time_ms: 42,
          checksum: "deadbeef",
        },
      ],
    });
    const store = new MigrationStore();
    const [record] = await store.getApplied();
    expect(record.version).toBe("20240101000000");
    expect(record.name).toBe("create_users");
    expect(record.appliedAt).toBe(appliedAt);
    expect(record.executionTimeMs).toBe(42);
    expect(record.checksum).toBe("deadbeef");
  });
});

describe("MigrationStore.getPending()", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns versions not yet applied", async () => {
    mockQuery.mockResolvedValue({
      rows: [
        {
          version: "20240101000000",
          name: "m1",
          applied_at: new Date(),
          execution_time_ms: 10,
          checksum: "a",
        },
      ],
    });
    const store = new MigrationStore();
    const pending = await store.getPending([
      "20240101000000",
      "20240101000001",
      "20240101000002",
    ]);
    expect(pending).toEqual(["20240101000001", "20240101000002"]);
  });

  it("returns all versions when nothing is applied", async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const store = new MigrationStore();
    const versions = ["20240101000000", "20240101000001"];
    const pending = await store.getPending(versions);
    expect(pending).toEqual(versions);
  });
});

describe("MigrationStore.record()", () => {
  beforeEach(() => vi.clearAllMocks());

  it("inserts a row with correct parameters", async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const store = new MigrationStore();
    const rec = makeRecord();
    await store.record(rec);
    expect(mockQuery).toHaveBeenCalledOnce();
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO _migrations/i);
    expect(params).toContain(rec.version);
    expect(params).toContain(rec.name);
    expect(params).toContain(rec.checksum);
  });
});

describe("MigrationStore.remove()", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes the row for the given version", async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const store = new MigrationStore();
    await store.remove("20240101000000");
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/DELETE FROM _migrations/i);
    expect(params).toContain("20240101000000");
  });
});

describe("MigrationStore.acquireLock / releaseLock", () => {
  beforeEach(() => vi.clearAllMocks());

  it("acquireLock returns true when pg_try_advisory_lock returns true", async () => {
    mockQuery.mockResolvedValue({ rows: [{ acquired: true }] });
    const store = new MigrationStore();
    const result = await store.acquireLock(12345);
    expect(result).toBe(true);
    expect(mockQuery).toHaveBeenCalledWith(
      "SELECT pg_try_advisory_lock($1) AS acquired",
      [12345]
    );
  });

  it("acquireLock returns false when lock is held by another session", async () => {
    mockQuery.mockResolvedValue({ rows: [{ acquired: false }] });
    const store = new MigrationStore();
    const result = await store.acquireLock(12345);
    expect(result).toBe(false);
  });

  it("releaseLock calls pg_advisory_unlock", async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const store = new MigrationStore();
    await store.releaseLock(12345);
    expect(mockQuery).toHaveBeenCalledWith(
      "SELECT pg_advisory_unlock($1)",
      [12345]
    );
  });
});

describe("MigrationStore.runInTransaction()", () => {
  let fakeClient: any;

  beforeEach(() => {
    vi.clearAllMocks();
    fakeClient = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      release: mockRelease,
    };
    mockConnect.mockResolvedValue(fakeClient);
  });

  it("wraps the callback in BEGIN / COMMIT", async () => {
    const store = new MigrationStore();
    const fn = vi.fn().mockResolvedValue(undefined);
    await store.runInTransaction(fn);

    const calls: string[] = fakeClient.query.mock.calls.map((c: any[]) => c[0]);
    expect(calls).toContain("BEGIN");
    expect(calls).toContain("COMMIT");
    expect(fn).toHaveBeenCalledOnce();
  });

  it("rolls back and rethrows on error", async () => {
    const store = new MigrationStore();
    const fn = vi.fn().mockRejectedValue(new Error("oops"));
    await expect(store.runInTransaction(fn)).rejects.toThrow("oops");

    const calls: string[] = fakeClient.query.mock.calls.map((c: any[]) => c[0]);
    expect(calls).toContain("ROLLBACK");
    expect(calls).not.toContain("COMMIT");
  });

  it("always releases the client", async () => {
    const store = new MigrationStore();
    // success case
    await store.runInTransaction(vi.fn().mockResolvedValue(undefined));
    expect(mockRelease).toHaveBeenCalledOnce();
  });

  it("releases client even when the callback throws", async () => {
    const store = new MigrationStore();
    await store.runInTransaction(vi.fn().mockRejectedValue(new Error("fail"))).catch(() => {});
    expect(mockRelease).toHaveBeenCalledOnce();
  });
});

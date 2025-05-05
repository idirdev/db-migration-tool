import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock pg so Seeder doesn't need a real DB
// ---------------------------------------------------------------------------

const fakeClientQuery = vi.fn().mockResolvedValue({ rows: [] });
const fakeClientRelease = vi.fn();
const fakeClient = { query: fakeClientQuery, release: fakeClientRelease };
const mockPoolConnect = vi.fn().mockResolvedValue(fakeClient);
const mockPoolEnd = vi.fn();

vi.mock("pg", () => {
  class Pool {
    connect: typeof mockPoolConnect;
    end: typeof mockPoolEnd;
    constructor() {
      this.connect = mockPoolConnect;
      this.end = mockPoolEnd;
    }
  }
  return { Pool };
});

import { Seeder } from "../src/Seeder";

// ---------------------------------------------------------------------------

describe("Seeder.generateData()", () => {
  const seeder = new Seeder("/tmp/no-seeds");

  it("generates the requested number of items", () => {
    const result = seeder.generateData("name", 5);
    expect(result).toHaveLength(5);
  });

  it("generates a valid-looking email", () => {
    const [email] = seeder.generateData("email", 1);
    expect(email).toMatch(/@/);
    expect(email).toMatch(/\.(com|org|net)$/);
  });

  it("generates a UUID v4-shaped string", () => {
    const [uuid] = seeder.generateData("uuid", 1);
    expect(uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it("generates integer values", () => {
    const nums = seeder.generateData("integer", 3);
    for (const n of nums) {
      expect(typeof n).toBe("number");
      expect(Number.isInteger(n)).toBe(true);
    }
  });

  it("generates boolean values", () => {
    const bools = seeder.generateData("boolean", 10);
    for (const b of bools) expect(typeof b).toBe("boolean");
  });

  it("generates ISO date strings (YYYY-MM-DD)", () => {
    const [d] = seeder.generateData("date", 1);
    expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("generates non-empty text strings", () => {
    const texts = seeder.generateData("text", 3);
    for (const t of texts) {
      expect(typeof t).toBe("string");
      expect(t.length).toBeGreaterThan(0);
    }
  });

  it("throws for unknown data type", () => {
    expect(() => seeder.generateData("unknown_type", 1)).toThrow(
      /Unknown data type/
    );
  });

  it("generates 1 item by default (no count argument)", () => {
    const result = seeder.generateData("name");
    expect(result).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Seeder.run() — no seed files
// ---------------------------------------------------------------------------

describe("Seeder.run() with no seed files", () => {
  beforeEach(() => vi.clearAllMocks());

  it("prints 'No seed files found' and does not connect to DB", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const seeder = new Seeder("/tmp/nonexistent-seeds-xyz");
    await seeder.run({ truncateFirst: false });
    expect(mockPoolConnect).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { MigrationGenerator } from "../src/MigrationGenerator";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "mg-test-"));
}

// ---------------------------------------------------------------------------
// MigrationGenerator
// ---------------------------------------------------------------------------

describe("MigrationGenerator", () => {
  let dir: string;
  let gen: MigrationGenerator;

  beforeEach(() => {
    dir = tmpDir();
    gen = new MigrationGenerator(dir);
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // create() — filename & format
  // -------------------------------------------------------------------------

  it("creates the migrations directory if it does not exist", async () => {
    const subDir = path.join(dir, "migrations");
    const g = new MigrationGenerator(subDir);
    await g.create("init");
    expect(fs.existsSync(subDir)).toBe(true);
  });

  it("create() returns an absolute file path", async () => {
    const fp = await gen.create("init_schema");
    expect(path.isAbsolute(fp)).toBe(true);
  });

  it("create() generates a .sql file by default", async () => {
    const fp = await gen.create("init_schema");
    expect(fp.endsWith(".sql")).toBe(true);
  });

  it("create() generates a .js file when format='js'", async () => {
    const fp = await gen.create("init_schema", "js");
    expect(fp.endsWith(".js")).toBe(true);
  });

  it("create() filename starts with a 14-digit timestamp version", async () => {
    const fp = await gen.create("my migration");
    const filename = path.basename(fp);
    expect(/^\d{14}_/.test(filename)).toBe(true);
  });

  it("sanitizes migration name to snake_case", async () => {
    const fp = await gen.create("Create Users Table!");
    const filename = path.basename(fp);
    expect(filename).toContain("create_users_table");
  });

  // -------------------------------------------------------------------------
  // SQL template content
  // -------------------------------------------------------------------------

  it("SQL template contains -- @up and -- @down sections", async () => {
    const fp = await gen.create("add_users");
    const content = fs.readFileSync(fp, "utf-8");
    expect(content).toContain("-- @up");
    expect(content).toContain("-- @down");
  });

  // -------------------------------------------------------------------------
  // JS template content
  // -------------------------------------------------------------------------

  it("JS template exports up and down functions", async () => {
    const fp = await gen.create("add_users", "js");
    const content = fs.readFileSync(fp, "utf-8");
    expect(content).toContain("async up(client)");
    expect(content).toContain("async down(client)");
    expect(content).toContain("module.exports");
  });

  // -------------------------------------------------------------------------
  // createTable()
  // -------------------------------------------------------------------------

  it("createTable() creates a file named create_<table>", async () => {
    const fp = await gen.createTable("orders");
    const filename = path.basename(fp);
    expect(filename).toContain("create_orders");
  });

  it("createTable() SQL template includes CREATE TABLE and DROP TABLE", async () => {
    const fp = await gen.createTable("orders");
    const content = fs.readFileSync(fp, "utf-8");
    expect(content).toContain("CREATE TABLE orders");
    expect(content).toContain("DROP TABLE IF EXISTS orders");
  });

  it("createTable() JS template includes CREATE TABLE and DROP TABLE", async () => {
    const fp = await gen.createTable("orders", "js");
    const content = fs.readFileSync(fp, "utf-8");
    expect(content).toContain("CREATE TABLE orders");
    expect(content).toContain("DROP TABLE IF EXISTS orders");
  });

  // -------------------------------------------------------------------------
  // addColumn()
  // -------------------------------------------------------------------------

  it("addColumn() creates a file with proper naming convention", async () => {
    const fp = await gen.addColumn("users", "phone", "VARCHAR(20)");
    const filename = path.basename(fp);
    expect(filename).toContain("add_phone_to_users");
    expect(filename.endsWith(".sql")).toBe(true);
  });

  it("addColumn() content includes ALTER TABLE ADD COLUMN and DROP COLUMN", async () => {
    const fp = await gen.addColumn("users", "phone", "VARCHAR(20)");
    const content = fs.readFileSync(fp, "utf-8");
    expect(content).toContain("ADD COLUMN phone VARCHAR(20)");
    expect(content).toContain("DROP COLUMN phone");
  });

  // -------------------------------------------------------------------------
  // addIndex()
  // -------------------------------------------------------------------------

  it("addIndex() creates a .sql file", async () => {
    const fp = await gen.addIndex("users", ["email"]);
    expect(fp.endsWith(".sql")).toBe(true);
  });

  it("addIndex() content includes CREATE INDEX and DROP INDEX", async () => {
    const fp = await gen.addIndex("users", ["email"]);
    const content = fs.readFileSync(fp, "utf-8");
    expect(content).toContain("CREATE INDEX idx_users_email ON users (email)");
    expect(content).toContain("DROP INDEX idx_users_email");
  });

  it("addIndex() creates UNIQUE INDEX when unique=true", async () => {
    const fp = await gen.addIndex("users", ["email"], true);
    const content = fs.readFileSync(fp, "utf-8");
    expect(content).toContain("CREATE UNIQUE INDEX");
  });

  it("addIndex() for composite index includes all column names", async () => {
    const fp = await gen.addIndex("orders", ["user_id", "status"]);
    const content = fs.readFileSync(fp, "utf-8");
    expect(content).toContain("user_id, status");
  });
});

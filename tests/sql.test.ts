import { describe, it, expect } from "vitest";
import {
  generateCreateTable,
  generateDropTable,
  generateAlterTable,
  generateCreateIndex,
  generateDropIndex,
} from "../src/utils/sql";
import { ColumnDefinition, IndexDefinition, TableDefinition } from "../src/types";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function makeCol(overrides: Partial<ColumnDefinition> = {}): ColumnDefinition {
  return {
    name: "my_col",
    type: "text",
    nullable: true,
    primaryKey: false,
    unique: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// generateDropTable
// ---------------------------------------------------------------------------

describe("generateDropTable", () => {
  it("generates DROP TABLE IF EXISTS by default", () => {
    expect(generateDropTable("users")).toBe("DROP TABLE IF EXISTS users;");
  });

  it("generates DROP TABLE without IF EXISTS when ifExists=false", () => {
    expect(generateDropTable("users", false)).toBe("DROP TABLE users;");
  });
});

// ---------------------------------------------------------------------------
// generateDropIndex
// ---------------------------------------------------------------------------

describe("generateDropIndex", () => {
  it("generates DROP INDEX IF EXISTS", () => {
    expect(generateDropIndex("idx_users_email")).toBe(
      "DROP INDEX IF EXISTS idx_users_email;"
    );
  });
});

// ---------------------------------------------------------------------------
// generateCreateIndex
// ---------------------------------------------------------------------------

describe("generateCreateIndex", () => {
  it("generates a basic index", () => {
    const idx: IndexDefinition = {
      name: "idx_users_email",
      table: "users",
      columns: ["email"],
      unique: false,
    };
    expect(generateCreateIndex(idx)).toBe(
      "CREATE INDEX idx_users_email ON users (email);"
    );
  });

  it("generates a unique index", () => {
    const idx: IndexDefinition = {
      name: "idx_users_email",
      table: "users",
      columns: ["email"],
      unique: true,
    };
    expect(generateCreateIndex(idx)).toContain("CREATE UNIQUE INDEX");
  });

  it("generates a partial index with WHERE clause", () => {
    const idx: IndexDefinition = {
      name: "idx_active_users",
      table: "users",
      columns: ["email"],
      unique: false,
      where: "deleted_at IS NULL",
    };
    const sql = generateCreateIndex(idx);
    expect(sql).toContain("WHERE deleted_at IS NULL");
  });

  it("generates a composite index", () => {
    const idx: IndexDefinition = {
      name: "idx_orders_user_status",
      table: "orders",
      columns: ["user_id", "status"],
      unique: false,
    };
    expect(generateCreateIndex(idx)).toBe(
      "CREATE INDEX idx_orders_user_status ON orders (user_id, status);"
    );
  });
});

// ---------------------------------------------------------------------------
// generateAlterTable
// ---------------------------------------------------------------------------

describe("generateAlterTable", () => {
  it("generates ADD COLUMN statement", () => {
    const col = makeCol({ name: "bio", type: "text", nullable: true });
    const sql = generateAlterTable("users", "ADD COLUMN", col);
    expect(sql).toBe("ALTER TABLE users ADD COLUMN bio TEXT;");
  });

  it("includes NOT NULL constraint when nullable=false", () => {
    const col = makeCol({ name: "email", type: "varchar", nullable: false });
    const sql = generateAlterTable("users", "ADD COLUMN", col);
    expect(sql).toContain("NOT NULL");
  });
});

// ---------------------------------------------------------------------------
// generateCreateTable — column types
// ---------------------------------------------------------------------------

describe("generateCreateTable — column types", () => {
  function tableWith(col: ColumnDefinition): string {
    return generateCreateTable({
      name: "t",
      columns: [col],
      indexes: [],
    });
  }

  it("maps 'varchar' to VARCHAR(n)", () => {
    expect(tableWith(makeCol({ type: "varchar", length: 100 }))).toContain("VARCHAR(100)");
  });

  it("uses default length 255 for varchar without length", () => {
    expect(tableWith(makeCol({ type: "varchar" }))).toContain("VARCHAR(255)");
  });

  it("maps 'integer' to INTEGER", () => {
    expect(tableWith(makeCol({ type: "integer" }))).toContain("INTEGER");
  });

  it("maps 'bigint' to BIGINT", () => {
    expect(tableWith(makeCol({ type: "bigint" }))).toContain("BIGINT");
  });

  it("maps 'serial' to SERIAL", () => {
    expect(tableWith(makeCol({ type: "serial" }))).toContain("SERIAL");
  });

  it("maps 'bigserial' to BIGSERIAL", () => {
    expect(tableWith(makeCol({ type: "bigserial" }))).toContain("BIGSERIAL");
  });

  it("maps 'boolean' to BOOLEAN", () => {
    expect(tableWith(makeCol({ type: "boolean" }))).toContain("BOOLEAN");
  });

  it("maps 'uuid' to UUID", () => {
    expect(tableWith(makeCol({ type: "uuid" }))).toContain("UUID");
  });

  it("maps 'jsonb' to JSONB", () => {
    expect(tableWith(makeCol({ type: "jsonb" }))).toContain("JSONB");
  });

  it("maps 'timestamptz' to TIMESTAMPTZ", () => {
    expect(tableWith(makeCol({ type: "timestamptz" }))).toContain("TIMESTAMPTZ");
  });

  it("maps 'decimal' with precision and scale", () => {
    const col = makeCol({ type: "decimal", precision: 10, scale: 2 });
    expect(tableWith(col)).toContain("DECIMAL(10, 2)");
  });

  it("maps 'decimal' with precision only", () => {
    const col = makeCol({ type: "decimal", precision: 10 });
    expect(tableWith(col)).toContain("DECIMAL(10)");
  });

  it("maps 'decimal' without precision", () => {
    const col = makeCol({ type: "decimal" });
    expect(tableWith(col)).toContain("DECIMAL");
  });
});

// ---------------------------------------------------------------------------
// generateCreateTable — constraints
// ---------------------------------------------------------------------------

describe("generateCreateTable — constraints and defaults", () => {
  it("adds PRIMARY KEY when column.primaryKey=true", () => {
    const sql = generateCreateTable({
      name: "users",
      columns: [makeCol({ name: "id", type: "serial", primaryKey: true, nullable: false })],
      indexes: [],
    });
    expect(sql).toContain("PRIMARY KEY");
  });

  it("adds UNIQUE when column.unique=true (non-PK)", () => {
    const sql = generateCreateTable({
      name: "users",
      columns: [makeCol({ name: "email", type: "varchar", unique: true, nullable: false })],
      indexes: [],
    });
    expect(sql).toContain("UNIQUE");
  });

  it("does NOT add NOT NULL on primary key column (PK implies NOT NULL)", () => {
    const sql = generateCreateTable({
      name: "users",
      columns: [makeCol({ name: "id", type: "serial", primaryKey: true, nullable: false })],
      indexes: [],
    });
    // Should have PRIMARY KEY but not a separate NOT NULL clause
    expect(sql).not.toMatch(/PRIMARY KEY.*NOT NULL/);
  });

  it("adds DEFAULT clause for string values without parentheses", () => {
    const col = makeCol({
      name: "role",
      type: "varchar",
      nullable: false,
      defaultValue: "user",
    });
    const sql = generateCreateTable({ name: "t", columns: [col], indexes: [] });
    expect(sql).toContain("DEFAULT 'user'");
  });

  it("adds DEFAULT clause for function calls (contains parentheses) without quoting", () => {
    const col = makeCol({
      name: "created_at",
      type: "timestamptz",
      nullable: false,
      defaultValue: "NOW()",
    });
    const sql = generateCreateTable({ name: "t", columns: [col], indexes: [] });
    expect(sql).toContain("DEFAULT NOW()");
    expect(sql).not.toContain("DEFAULT 'NOW()'");
  });

  it("adds DEFAULT clause for boolean values", () => {
    const col = makeCol({
      name: "active",
      type: "boolean",
      nullable: false,
      defaultValue: true,
    });
    const sql = generateCreateTable({ name: "t", columns: [col], indexes: [] });
    expect(sql).toContain("DEFAULT true");
  });

  it("includes composite primary key constraint", () => {
    const tableDef: TableDefinition = {
      name: "user_roles",
      columns: [
        makeCol({ name: "user_id", type: "integer", nullable: false }),
        makeCol({ name: "role_id", type: "integer", nullable: false }),
      ],
      indexes: [],
      primaryKey: ["user_id", "role_id"],
    };
    const sql = generateCreateTable(tableDef);
    expect(sql).toContain("PRIMARY KEY (user_id, role_id)");
  });

  it("includes FOREIGN KEY when column has references", () => {
    const col = makeCol({
      name: "user_id",
      type: "integer",
      nullable: false,
      references: { table: "users", column: "id", onDelete: "CASCADE" },
    });
    const sql = generateCreateTable({ name: "posts", columns: [col], indexes: [] });
    expect(sql).toContain("FOREIGN KEY (user_id) REFERENCES users(id)");
    expect(sql).toContain("ON DELETE CASCADE");
  });

  it("appends index DDL after CREATE TABLE block", () => {
    const tableDef: TableDefinition = {
      name: "users",
      columns: [makeCol({ name: "email", type: "varchar", nullable: false })],
      indexes: [
        { name: "idx_users_email", table: "users", columns: ["email"], unique: true },
      ],
    };
    const sql = generateCreateTable(tableDef);
    expect(sql).toContain("CREATE UNIQUE INDEX idx_users_email ON users (email);");
  });
});

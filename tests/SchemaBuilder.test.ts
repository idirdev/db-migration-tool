import { describe, it, expect } from "vitest";
import { SchemaBuilder } from "../src/SchemaBuilder";

// ---------------------------------------------------------------------------
// SchemaBuilder — createTable
// ---------------------------------------------------------------------------

describe("SchemaBuilder.createTable", () => {
  it("generates CREATE TABLE SQL", () => {
    const sql = new SchemaBuilder()
      .createTable("users", (t) => {
        t.serial("id").primary();
        t.varchar("email", 255).notNull().unique();
        t.text("bio");
      })
      .toSQL();

    expect(sql).toContain("CREATE TABLE users");
    expect(sql).toContain("id SERIAL PRIMARY KEY");
    expect(sql).toContain("email VARCHAR(255)");
    expect(sql).toContain("bio TEXT");
  });

  it("adds timestamps helper columns", () => {
    const sql = new SchemaBuilder()
      .createTable("posts", (t) => {
        t.serial("id").primary();
        t.timestamps();
      })
      .toSQL();

    expect(sql).toContain("created_at");
    expect(sql).toContain("updated_at");
    expect(sql).toContain("DEFAULT NOW()");
  });

  it("adds composite primary key", () => {
    const sql = new SchemaBuilder()
      .createTable("user_roles", (t) => {
        t.integer("user_id").notNull();
        t.integer("role_id").notNull();
        t.primaryKey(["user_id", "role_id"]);
      })
      .toSQL();

    expect(sql).toContain("PRIMARY KEY (user_id, role_id)");
  });

  it("adds inline index via table.index()", () => {
    const sql = new SchemaBuilder()
      .createTable("posts", (t) => {
        t.integer("user_id").notNull();
        t.index(["user_id"]);
      })
      .toSQL();

    expect(sql).toContain("CREATE INDEX idx_posts_user_id ON posts (user_id)");
  });

  it("adds unique inline index via table.index()", () => {
    const sql = new SchemaBuilder()
      .createTable("users", (t) => {
        t.varchar("email", 100).notNull();
        t.index(["email"], { unique: true });
      })
      .toSQL();

    expect(sql).toContain("CREATE UNIQUE INDEX");
  });

  it("supports column with references (foreign key)", () => {
    const sql = new SchemaBuilder()
      .createTable("orders", (t) => {
        t.integer("user_id").notNull().references("users", "id", "CASCADE");
      })
      .toSQL();

    expect(sql).toContain("FOREIGN KEY (user_id) REFERENCES users(id)");
    expect(sql).toContain("ON DELETE CASCADE");
  });
});

// ---------------------------------------------------------------------------
// SchemaBuilder — dropTable
// ---------------------------------------------------------------------------

describe("SchemaBuilder.dropTable", () => {
  it("generates DROP TABLE IF EXISTS by default", () => {
    const sql = new SchemaBuilder().dropTable("users").toSQL();
    expect(sql).toBe("DROP TABLE IF EXISTS users;");
  });

  it("generates DROP TABLE without IF EXISTS when ifExists=false", () => {
    const sql = new SchemaBuilder().dropTable("users", false).toSQL();
    expect(sql).toBe("DROP TABLE users;");
  });
});

// ---------------------------------------------------------------------------
// SchemaBuilder — addColumn / dropColumn / renameColumn
// ---------------------------------------------------------------------------

describe("SchemaBuilder column operations", () => {
  it("generates ALTER TABLE ADD COLUMN", () => {
    const sql = new SchemaBuilder()
      .addColumn("users", "phone", "varchar", (c) => c.notNull())
      .toSQL();

    expect(sql).toContain("ALTER TABLE users ADD COLUMN phone VARCHAR(255) NOT NULL;");
  });

  it("generates ALTER TABLE DROP COLUMN", () => {
    const sql = new SchemaBuilder().dropColumn("users", "phone").toSQL();
    expect(sql).toBe("ALTER TABLE users DROP COLUMN phone;");
  });

  it("generates ALTER TABLE RENAME COLUMN", () => {
    const sql = new SchemaBuilder()
      .renameColumn("users", "phone", "mobile")
      .toSQL();
    expect(sql).toBe("ALTER TABLE users RENAME COLUMN phone TO mobile;");
  });

  it("generates ALTER TABLE RENAME TO", () => {
    const sql = new SchemaBuilder().renameTable("users", "members").toSQL();
    expect(sql).toBe("ALTER TABLE users RENAME TO members;");
  });
});

// ---------------------------------------------------------------------------
// SchemaBuilder — addIndex / dropIndex
// ---------------------------------------------------------------------------

describe("SchemaBuilder index operations", () => {
  it("generates CREATE INDEX with auto-generated name", () => {
    const sql = new SchemaBuilder()
      .addIndex("users", ["email"])
      .toSQL();
    expect(sql).toContain("CREATE INDEX idx_users_email ON users (email);");
  });

  it("generates CREATE UNIQUE INDEX", () => {
    const sql = new SchemaBuilder()
      .addIndex("users", ["email"], { unique: true })
      .toSQL();
    expect(sql).toContain("CREATE UNIQUE INDEX");
  });

  it("respects custom index name", () => {
    const sql = new SchemaBuilder()
      .addIndex("users", ["email"], { name: "my_custom_idx" })
      .toSQL();
    expect(sql).toContain("my_custom_idx");
  });

  it("generates partial index with WHERE", () => {
    const sql = new SchemaBuilder()
      .addIndex("users", ["email"], { where: "active = true" })
      .toSQL();
    expect(sql).toContain("WHERE active = true");
  });

  it("generates DROP INDEX IF EXISTS", () => {
    const sql = new SchemaBuilder().dropIndex("idx_users_email").toSQL();
    expect(sql).toBe("DROP INDEX IF EXISTS idx_users_email;");
  });
});

// ---------------------------------------------------------------------------
// SchemaBuilder — addForeignKey
// ---------------------------------------------------------------------------

describe("SchemaBuilder.addForeignKey", () => {
  it("generates ALTER TABLE ADD CONSTRAINT FOREIGN KEY", () => {
    const sql = new SchemaBuilder()
      .addForeignKey("orders", "user_id", "users")
      .toSQL();

    expect(sql).toContain("ALTER TABLE orders ADD CONSTRAINT fk_orders_user_id_users");
    expect(sql).toContain("FOREIGN KEY (user_id) REFERENCES users(id)");
    expect(sql).toContain("ON DELETE CASCADE");
  });

  it("allows custom onDelete action", () => {
    const sql = new SchemaBuilder()
      .addForeignKey("orders", "user_id", "users", "id", "SET NULL")
      .toSQL();
    expect(sql).toContain("ON DELETE SET NULL");
  });
});

// ---------------------------------------------------------------------------
// SchemaBuilder — raw / chaining / toSQL
// ---------------------------------------------------------------------------

describe("SchemaBuilder.raw and chaining", () => {
  it("appends raw SQL verbatim", () => {
    const sql = new SchemaBuilder()
      .raw("CREATE EXTENSION IF NOT EXISTS pgcrypto;")
      .toSQL();
    expect(sql).toBe("CREATE EXTENSION IF NOT EXISTS pgcrypto;");
  });

  it("joins multiple operations with double newlines", () => {
    const sql = new SchemaBuilder()
      .dropTable("a")
      .dropTable("b")
      .toSQL();
    expect(sql).toBe(
      "DROP TABLE IF EXISTS a;\n\nDROP TABLE IF EXISTS b;"
    );
  });
});

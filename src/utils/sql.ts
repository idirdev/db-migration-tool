import { ColumnDefinition, IndexDefinition, TableDefinition } from "../types";

export function generateCreateTable(table: TableDefinition): string {
  const columnDefs = table.columns.map((col) => `  ${columnToSQL(col)}`);
  const constraints: string[] = [];

  if (table.primaryKey && table.primaryKey.length > 0) {
    constraints.push(`  PRIMARY KEY (${table.primaryKey.join(", ")})`);
  }

  const foreignKeys = table.columns.filter((c) => c.references);
  for (const col of foreignKeys) {
    const ref = col.references!;
    let fk = `  FOREIGN KEY (${col.name}) REFERENCES ${ref.table}(${ref.column})`;
    if (ref.onDelete) fk += ` ON DELETE ${ref.onDelete}`;
    if (ref.onUpdate) fk += ` ON UPDATE ${ref.onUpdate}`;
    constraints.push(fk);
  }

  const allDefs = [...columnDefs, ...constraints].join(",\n");
  let sql = `CREATE TABLE ${table.name} (\n${allDefs}\n);`;

  for (const index of table.indexes) {
    sql += `\n\n${generateCreateIndex(index)}`;
  }

  return sql;
}

export function generateDropTable(name: string, ifExists: boolean = true): string {
  return `DROP TABLE${ifExists ? " IF EXISTS" : ""} ${name};`;
}

export function generateAlterTable(table: string, action: string, column: ColumnDefinition): string {
  return `ALTER TABLE ${table} ${action} ${columnToSQL(column)};`;
}

export function generateCreateIndex(index: IndexDefinition): string {
  const unique = index.unique ? "UNIQUE " : "";
  let sql = `CREATE ${unique}INDEX ${index.name} ON ${index.table} (${index.columns.join(", ")})`;
  if (index.where) sql += ` WHERE ${index.where}`;
  return sql + ";";
}

export function generateDropIndex(name: string): string {
  return `DROP INDEX IF EXISTS ${name};`;
}

function columnToSQL(col: ColumnDefinition): string {
  let sql = `${col.name} ${typeToSQL(col)}`;

  if (col.primaryKey) sql += " PRIMARY KEY";
  if (!col.nullable && !col.primaryKey) sql += " NOT NULL";
  if (col.unique && !col.primaryKey) sql += " UNIQUE";

  if (col.defaultValue !== undefined && col.defaultValue !== null) {
    const val = typeof col.defaultValue === "string" && !col.defaultValue.includes("(")
      ? `'${col.defaultValue}'`
      : String(col.defaultValue);
    sql += ` DEFAULT ${val}`;
  }

  return sql;
}

function typeToSQL(col: ColumnDefinition): string {
  switch (col.type) {
    case "varchar":
      return `VARCHAR(${col.length || 255})`;
    case "decimal":
      if (col.precision !== undefined) {
        return col.scale !== undefined
          ? `DECIMAL(${col.precision}, ${col.scale})`
          : `DECIMAL(${col.precision})`;
      }
      return "DECIMAL";
    case "serial":
      return "SERIAL";
    case "bigserial":
      return "BIGSERIAL";
    case "integer":
      return "INTEGER";
    case "bigint":
      return "BIGINT";
    case "smallint":
      return "SMALLINT";
    case "float":
      return "FLOAT";
    case "boolean":
      return "BOOLEAN";
    case "text":
      return "TEXT";
    case "date":
      return "DATE";
    case "timestamp":
      return "TIMESTAMP";
    case "timestamptz":
      return "TIMESTAMPTZ";
    case "json":
      return "JSON";
    case "jsonb":
      return "JSONB";
    case "uuid":
      return "UUID";
    default:
      return col.type.toUpperCase();
  }
}

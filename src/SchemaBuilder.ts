import { ColumnDefinition, ColumnType, IndexDefinition, TableDefinition } from "./types";
import { generateCreateTable, generateAlterTable, generateCreateIndex, generateDropIndex, generateDropTable } from "./utils/sql";

class ColumnBuilder {
  private column: ColumnDefinition;

  constructor(name: string, type: ColumnType, length?: number) {
    this.column = {
      name,
      type,
      length,
      nullable: true,
      primaryKey: false,
      unique: false,
    };
  }

  notNull(): this {
    this.column.nullable = false;
    return this;
  }

  primary(): this {
    this.column.primaryKey = true;
    this.column.nullable = false;
    return this;
  }

  unique(): this {
    this.column.unique = true;
    return this;
  }

  default(value: string | number | boolean | null): this {
    this.column.defaultValue = value;
    return this;
  }

  references(table: string, column: string = "id", onDelete?: string, onUpdate?: string): this {
    this.column.references = { table, column, onDelete, onUpdate };
    return this;
  }

  precision(p: number, s?: number): this {
    this.column.precision = p;
    this.column.scale = s;
    return this;
  }

  build(): ColumnDefinition {
    return { ...this.column };
  }
}

export class SchemaBuilder {
  private operations: string[] = [];

  createTable(name: string, define: (table: TableBuilder) => void): this {
    const builder = new TableBuilder(name);
    define(builder);
    const tableDef = builder.build();
    this.operations.push(generateCreateTable(tableDef));
    return this;
  }

  dropTable(name: string, ifExists: boolean = true): this {
    this.operations.push(generateDropTable(name, ifExists));
    return this;
  }

  addColumn(table: string, name: string, type: ColumnType, configure?: (col: ColumnBuilder) => void): this {
    const col = new ColumnBuilder(name, type);
    if (configure) configure(col);
    this.operations.push(generateAlterTable(table, "ADD COLUMN", col.build()));
    return this;
  }

  dropColumn(table: string, name: string): this {
    this.operations.push(`ALTER TABLE ${table} DROP COLUMN ${name};`);
    return this;
  }

  renameColumn(table: string, oldName: string, newName: string): this {
    this.operations.push(`ALTER TABLE ${table} RENAME COLUMN ${oldName} TO ${newName};`);
    return this;
  }

  renameTable(oldName: string, newName: string): this {
    this.operations.push(`ALTER TABLE ${oldName} RENAME TO ${newName};`);
    return this;
  }

  addIndex(table: string, columns: string[], options?: { name?: string; unique?: boolean; where?: string }): this {
    const indexDef: IndexDefinition = {
      name: options?.name || `idx_${table}_${columns.join("_")}`,
      table,
      columns,
      unique: options?.unique || false,
      where: options?.where,
    };
    this.operations.push(generateCreateIndex(indexDef));
    return this;
  }

  dropIndex(name: string): this {
    this.operations.push(generateDropIndex(name));
    return this;
  }

  addForeignKey(table: string, column: string, refTable: string, refColumn: string = "id", onDelete: string = "CASCADE"): this {
    const constraintName = `fk_${table}_${column}_${refTable}`;
    this.operations.push(
      `ALTER TABLE ${table} ADD CONSTRAINT ${constraintName} FOREIGN KEY (${column}) REFERENCES ${refTable}(${refColumn}) ON DELETE ${onDelete};`
    );
    return this;
  }

  raw(sql: string): this {
    this.operations.push(sql);
    return this;
  }

  toSQL(): string {
    return this.operations.join("\n\n");
  }
}

export class TableBuilder {
  private name: string;
  private columns: ColumnDefinition[] = [];
  private indexes: IndexDefinition[] = [];
  private compositePrimaryKey?: string[];

  constructor(name: string) {
    this.name = name;
  }

  serial(name: string): ColumnBuilder { return this.addCol(name, "serial"); }
  bigserial(name: string): ColumnBuilder { return this.addCol(name, "bigserial"); }
  varchar(name: string, length: number = 255): ColumnBuilder { return this.addCol(name, "varchar", length); }
  text(name: string): ColumnBuilder { return this.addCol(name, "text"); }
  integer(name: string): ColumnBuilder { return this.addCol(name, "integer"); }
  bigint(name: string): ColumnBuilder { return this.addCol(name, "bigint"); }
  smallint(name: string): ColumnBuilder { return this.addCol(name, "smallint"); }
  decimal(name: string, precision?: number, scale?: number): ColumnBuilder {
    const col = this.addCol(name, "decimal");
    if (precision !== undefined) col.precision(precision, scale);
    return col;
  }
  float(name: string): ColumnBuilder { return this.addCol(name, "float"); }
  boolean(name: string): ColumnBuilder { return this.addCol(name, "boolean"); }
  date(name: string): ColumnBuilder { return this.addCol(name, "date"); }
  timestamp(name: string): ColumnBuilder { return this.addCol(name, "timestamp"); }
  timestamptz(name: string): ColumnBuilder { return this.addCol(name, "timestamptz"); }
  json(name: string): ColumnBuilder { return this.addCol(name, "json"); }
  jsonb(name: string): ColumnBuilder { return this.addCol(name, "jsonb"); }
  uuid(name: string): ColumnBuilder { return this.addCol(name, "uuid"); }

  timestamps(): void {
    this.timestamptz("created_at").notNull().default("NOW()");
    this.timestamptz("updated_at").notNull().default("NOW()");
  }

  primaryKey(columns: string[]): void {
    this.compositePrimaryKey = columns;
  }

  index(columns: string[], options?: { unique?: boolean; name?: string }): void {
    this.indexes.push({
      name: options?.name || `idx_${this.name}_${columns.join("_")}`,
      table: this.name,
      columns,
      unique: options?.unique || false,
    });
  }

  private addCol(name: string, type: ColumnType, length?: number): ColumnBuilder {
    const builder = new ColumnBuilder(name, type, length);
    this.columns.push(builder.build());
    return builder;
  }

  build(): TableDefinition {
    return {
      name: this.name,
      columns: this.columns,
      indexes: this.indexes,
      primaryKey: this.compositePrimaryKey,
    };
  }
}

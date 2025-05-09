# db-migration-tool

[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue?logo=typescript)](https://typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green?logo=node.js)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?logo=postgresql)](https://postgresql.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A robust database migration engine for PostgreSQL with a fluent schema DSL, seeding support, and CLI interface.

## Features

- **Timestamped migrations** - Ordered, versioned migration files
- **Up/Down support** - Apply and revert migrations with transaction safety
- **Advisory locking** - Prevents concurrent migration runs
- **Schema DSL** - Fluent API for building tables and columns
- **SQL & JS formats** - Write migrations in raw SQL or JavaScript
- **Seeding** - Populate tables with test or initial data
- **Status tracking** - View applied and pending migrations
- **Checksum validation** - Detect migration file changes

## Installation

```bash
npm install
npm run build
```

## CLI Reference

```bash
# Create a new migration
migrate create <name> [--format sql|js] [--dir ./migrations]

# Apply pending migrations
migrate up [--steps N] [--dir ./migrations]

# Revert last N migrations
migrate down [--steps N] [--dir ./migrations]

# Show migration status
migrate status [--dir ./migrations]

# Revert all migrations
migrate reset [--dir ./migrations]

# Run seed files
migrate seed [--dir ./seeds] [--truncate]
```

## Migration File Format

### SQL Format

```sql
-- Migration: create_users
-- Created at: 2024-01-15T10:30:00.000Z

-- @up
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- @down
DROP TABLE IF EXISTS users;
```

### JS Format

```js
module.exports = {
  async up(client) {
    await client.query(`
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE
      );
    `);
  },

  async down(client) {
    await client.query(`DROP TABLE IF EXISTS users;`);
  },
};
```

## Schema DSL

```typescript
import { SchemaBuilder } from "./SchemaBuilder";

const schema = new SchemaBuilder();

schema.createTable("users", (table) => {
  table.serial("id").primary();
  table.varchar("email", 255).notNull().unique();
  table.varchar("name", 100).notNull();
  table.boolean("active").default(true);
  table.jsonb("metadata");
  table.timestamps();
  table.index(["email"], { unique: true });
});

schema.addColumn("users", "avatar_url", "text");
schema.addIndex("users", ["name", "email"]);
schema.addForeignKey("posts", "user_id", "users");

console.log(schema.toSQL());
```

## Seed Files

```js
// seeds/001_users.js
module.exports = {
  table: "users",
  data: [
    { email: "admin@example.com", name: "Admin", active: true },
    { email: "user@example.com", name: "User", active: true },
  ],
};
```

Or with the generator:

```js
module.exports = {
  table: "users",
  async seed(client, { generate }) {
    const names = generate("name", 50);
    const emails = generate("email", 50);
    // Insert generated data...
  },
};
```

## Environment Variables

```env
DATABASE_URL=postgres://user:pass@localhost:5432/mydb
# Or individual variables:
DB_HOST=localhost
DB_PORT=5432
DB_NAME=mydb
DB_USER=user
DB_PASSWORD=pass
```

## License

MIT

---

## 🇫🇷 Documentation en français

### Description
`db-migration-tool` est un moteur de migration de base de données robuste pour PostgreSQL, doté d'un DSL de schéma fluide, d'un support de seeding et d'une interface CLI. Il offre des migrations versionnées avec transactions, verrouillage consultatif et validation par checksum pour garantir l'intégrité des migrations. Écrit en TypeScript, il prend en charge les formats SQL et JavaScript.

### Installation
```bash
npm install
npm run build
```

### Utilisation
```bash
# Créer une nouvelle migration
migrate create <nom> [--format sql|js] [--dir ./migrations]

# Appliquer les migrations en attente
migrate up [--steps N] [--dir ./migrations]

# Annuler les dernières migrations
migrate down [--steps N] [--dir ./migrations]

# Afficher le statut des migrations
migrate status [--dir ./migrations]

# Réinitialiser toutes les migrations
migrate reset [--dir ./migrations]

# Exécuter les fichiers de seed
migrate seed [--dir ./seeds] [--truncate]
```

Consultez la documentation en anglais ci-dessus pour les détails complets sur les formats de migration, le DSL de schéma et les variables d'environnement.

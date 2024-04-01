#!/usr/bin/env node

import { Command } from "commander";
import { MigrationRunner } from "./MigrationRunner";
import { MigrationGenerator } from "./MigrationGenerator";
import { Seeder } from "./Seeder";

const program = new Command();

program
  .name("migrate")
  .description("Database migration tool with schema DSL and seeding support")
  .version("1.0.0");

program
  .command("create <name>")
  .description("Create a new migration file")
  .option("-f, --format <format>", "Migration format: sql or js", "sql")
  .option("-d, --dir <directory>", "Migrations directory", "./migrations")
  .action(async (name: string, opts) => {
    const generator = new MigrationGenerator(opts.dir);
    const filePath = await generator.create(name, opts.format);
    console.log(`Created migration: ${filePath}`);
  });

program
  .command("up")
  .description("Apply all pending migrations")
  .option("-d, --dir <directory>", "Migrations directory", "./migrations")
  .option("-s, --steps <count>", "Number of migrations to apply")
  .action(async (opts) => {
    const runner = new MigrationRunner(opts.dir);
    const applied = await runner.up(opts.steps ? parseInt(opts.steps) : undefined);
    console.log(`Applied ${applied} migration(s)`);
  });

program
  .command("down")
  .description("Revert the last migration(s)")
  .option("-d, --dir <directory>", "Migrations directory", "./migrations")
  .option("-s, --steps <count>", "Number of migrations to revert", "1")
  .action(async (opts) => {
    const runner = new MigrationRunner(opts.dir);
    const reverted = await runner.down(parseInt(opts.steps));
    console.log(`Reverted ${reverted} migration(s)`);
  });

program
  .command("status")
  .description("Show migration status")
  .option("-d, --dir <directory>", "Migrations directory", "./migrations")
  .action(async (opts) => {
    const runner = new MigrationRunner(opts.dir);
    await runner.status();
  });

program
  .command("reset")
  .description("Revert all migrations")
  .option("-d, --dir <directory>", "Migrations directory", "./migrations")
  .action(async (opts) => {
    const runner = new MigrationRunner(opts.dir);
    const reverted = await runner.reset();
    console.log(`Reset complete. Reverted ${reverted} migration(s)`);
  });

program
  .command("seed")
  .description("Run seed files")
  .option("-d, --dir <directory>", "Seeds directory", "./seeds")
  .option("--truncate", "Truncate tables before seeding", false)
  .action(async (opts) => {
    const seeder = new Seeder(opts.dir);
    await seeder.run({ truncateFirst: opts.truncate });
    console.log("Seeding complete");
  });

program.parse(process.argv);

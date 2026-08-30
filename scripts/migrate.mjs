import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is required for db:migrate");
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const sql = await readFile(join(here, "..", "migrations", "001_initial.sql"), "utf8");
const sslMode = process.env.DATABASE_SSL?.toLowerCase();
const pool = new pg.Pool({
  connectionString,
  ssl:
    sslMode === "disable"
      ? false
      : sslMode === "require"
        ? { rejectUnauthorized: false }
        : undefined,
});

try {
  await pool.query(sql);
  console.log("Artifactories database migration complete.");
} finally {
  await pool.end();
}

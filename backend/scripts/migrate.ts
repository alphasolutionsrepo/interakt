import { fileURLToPath } from "url";
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { parse } from "pg-connection-string";

// Load environment variables
config({ path: ".env" });

const ensureDatabaseExists = async (connectionString: string, verbose = true) => {
  const config = parse(connectionString);

  const {
    user,
    password,
    host,
    port,
    database: dbName,
  } = config;

  if (!dbName) throw new Error("Database name could not be determined from connection string");

  const defaultDb = "postgres";

  const adminConnectionString = `postgresql://${user}:${password}@${host}:${port ?? 5432}/${defaultDb}`;
  const sql = postgres(adminConnectionString, { max: 1 });

  const dbExistsQuery = sql`
    SELECT 1 FROM pg_database WHERE datname = ${dbName}
  `;

  const result = await dbExistsQuery;
  if (result.length === 0) {
    if (verbose) console.log(`📦 Database '${dbName}' does not exist. Creating...`);
    await sql.unsafe(`CREATE DATABASE "${dbName}"`);
    if (verbose) console.log(`✅ Database '${dbName}' created.`);
  } else {
    if (verbose) console.log(`✅ Database '${dbName}' already exists.`);
  }

  await sql.end();
};

/**
 * Run Drizzle migrations
 */
const runMigrations = async (options: {
  migrationsFolder?: string;
  verbose?: boolean;
} = {}) => {
  const {
    migrationsFolder = "./db/drizzle",
    verbose = true,
  } = options;

  const postgresUrl = process.env.POSTGRES_URL;
  if (!postgresUrl) {
    throw new Error("POSTGRES_URL environment variable is not defined");
  }

  await ensureDatabaseExists(postgresUrl, verbose);

  if (verbose) {
    console.log(`⏳ Running Drizzle migrations from ${migrationsFolder}`);
    console.log(`⏳ Database URL: ${postgresUrl.substring(0, 20)}...`);
  }

  const connection = postgres(postgresUrl, { max: 1 });
  const db = drizzle(connection);

  const start = Date.now();

  try {
    await migrate(db, { migrationsFolder });
    const end = Date.now();
    if (verbose) {
      console.log(`✅ Migrations completed in ${end - start}ms`);
    }
    return { success: true, duration: end - start };
  } catch (error) {
    console.error("❌ Migration failed");
    console.error(error);
    throw error;
  } finally {
    await connection.end();
  }
};

const dbsetup = async () => {
  try {
    return await runMigrations();
  } catch (err) {
    console.error("❌ Database setup failed");
    console.error(err);
    process.exit(1);
  }
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

export default dbsetup;
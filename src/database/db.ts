import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import path from "path";
import * as schema from "./schema";

const sqlite = new Database(path.join(__dirname, "../../database.sqlite"));
sqlite.pragma("journal_mode = WAL");

const db = drizzle(sqlite, { schema });

export default db;
export { sqlite };

import Database from "better-sqlite3";
import path from "path";

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, "../../database.sqlite");

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

export default db;
export { sqlite };

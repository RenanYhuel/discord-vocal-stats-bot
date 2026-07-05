import { sqlite } from "./db";

export function initSchema(): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS system_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT, 
      timestamp TEXT NOT NULL, 
      level TEXT NOT NULL, 
      message TEXT NOT NULL, 
      details TEXT
    );
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS state (
      key TEXT PRIMARY KEY, 
      value TEXT NOT NULL
    );
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY, 
      channel_id TEXT NOT NULL, 
      guild_id TEXT NOT NULL, 
      author_id TEXT NOT NULL, 
      author_name TEXT NOT NULL, 
      content TEXT, 
      embeds TEXT, 
      attachments TEXT, 
      created_at TEXT NOT NULL
    );
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS voice_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, 
      message_id TEXT NOT NULL, 
      user_name TEXT NOT NULL, 
      user_id TEXT NOT NULL, 
      channel_name TEXT NOT NULL, 
      type TEXT NOT NULL, 
      timestamp TEXT NOT NULL, 
      dedup_hash TEXT UNIQUE, 
      raw TEXT
    );
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS voice_current (
      user_id TEXT PRIMARY KEY, 
      username TEXT NOT NULL, 
      channel_id TEXT NOT NULL, 
      channel_name TEXT NOT NULL, 
      joined_at TEXT NOT NULL,
      is_deaf INTEGER DEFAULT 0,
      deafened_at TEXT
    );
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS voice_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, 
      user_id TEXT NOT NULL, 
      user_name TEXT NOT NULL, 
      channel_name TEXT NOT NULL, 
      join_time TEXT NOT NULL, 
      leave_time TEXT NOT NULL, 
      duration_sec INTEGER NOT NULL,
      active_sec INTEGER NOT NULL DEFAULT 0,
      deaf_sec INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_voice_sessions_user ON voice_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_voice_sessions_join ON voice_sessions(join_time);
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS voice_deaf_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      channel_name TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      duration_sec INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_voice_deaf_user ON voice_deaf_sessions(user_id);
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS leaderboard_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_date TEXT NOT NULL, 
      period_type TEXT NOT NULL,    
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      rank INTEGER NOT NULL,
      total_time INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_leaderboard_snapshots_date ON leaderboard_snapshots(snapshot_date);
  `);
}

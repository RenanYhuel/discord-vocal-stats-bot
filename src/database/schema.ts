import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const systemLogs = sqliteTable("system_logs", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    timestamp: text("timestamp").notNull(),
    level: text("level").notNull(),
    message: text("message").notNull(),
    details: text("details"),
});

export const state = sqliteTable("state", {
    key: text("key").primaryKey(),
    value: text("value").notNull(),
});

export const messages = sqliteTable("messages", {
    id: text("id").primaryKey(),
    channelId: text("channel_id").notNull(),
    guildId: text("guild_id").notNull(),
    authorId: text("author_id").notNull(),
    authorName: text("author_name").notNull(),
    content: text("content"),
    embeds: text("embeds"),
    attachments: text("attachments"),
    createdAt: text("created_at").notNull(),
});

export const voiceEvents = sqliteTable("voice_events", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    messageId: text("message_id").notNull(),
    userName: text("user_name").notNull(),
    userId: text("user_id").notNull(),
    channelName: text("channel_name").notNull(),
    type: text("type").notNull(),
    timestamp: text("timestamp").notNull(),
    dedupHash: text("dedup_hash").unique(),
    raw: text("raw"),
});

export const voiceCurrent = sqliteTable("voice_current", {
    userId: text("user_id").primaryKey(),
    username: text("username").notNull(),
    channelId: text("channel_id").notNull(),
    channelName: text("channel_name").notNull(),
    joinedAt: text("joined_at").notNull(),
    isDeaf: integer("is_deaf").default(0),
    deafenedAt: text("deafened_at"),
});

export const voiceSessions = sqliteTable("voice_sessions", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id").notNull(),
    userName: text("user_name").notNull(),
    channelName: text("channel_name").notNull(),
    joinTime: text("join_time").notNull(),
    leaveTime: text("leave_time").notNull(),
    durationSec: integer("duration_sec").notNull(),
    activeSec: integer("active_sec").default(0).notNull(),
    deafSec: integer("deaf_sec").default(0).notNull(),
});

export const voiceDeafSessions = sqliteTable("voice_deaf_sessions", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id").notNull(),
    userName: text("user_name").notNull(),
    channelName: text("channel_name").notNull(),
    startTime: text("start_time").notNull(),
    endTime: text("end_time").notNull(),
    durationSec: integer("duration_sec").notNull(),
});

export const leaderboardSnapshots = sqliteTable("leaderboard_snapshots", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    snapshotDate: text("snapshot_date").notNull(),
    periodType: text("period_type").notNull(),
    userId: text("user_id").notNull(),
    userName: text("user_name").notNull(),
    rank: integer("rank").notNull(),
    totalTime: integer("total_time").notNull(),
});

export const userAchievements = sqliteTable("user_achievements", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id").notNull(),
    achievementId: text("achievement_id").notNull(),
    unlockedAt: text("unlocked_at").notNull(),
});

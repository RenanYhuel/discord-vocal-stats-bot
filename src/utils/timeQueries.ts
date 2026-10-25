import db from "../database/db";
import { voiceSessions } from "../database/schema";
import { sql, eq, and } from "drizzle-orm";

export interface DBTimeUserStats {
    totalSec: number | null;
    activeSec: number;
    deafSec: number;
    totalSessions: number;
    maxSessionSec: number;
}

export interface DBTimeLeaderboardRow {
    userId: string;
    userName: string;
    totalSec: number;
}

export interface DBTimeFavChan {
    channelName: string;
    totalSec: number;
}

export interface DBBestDay {
    dayStr: string;
    totalSec: number;
}

export interface DBBestMonth {
    monthStr: string;
    totalSec: number;
}

export interface DBPartnerRow {
    userId: string;
    userName: string;
    overlapSec: number;
}

export function getUserStatsForYear(userId: string, year: number): DBTimeUserStats | undefined {
    const yearStr = String(year);
    return db
        .select({
            totalSec: sql<number>`SUM(${voiceSessions.durationSec})`,
            activeSec: sql<number>`SUM(${voiceSessions.activeSec})`,
            deafSec: sql<number>`SUM(${voiceSessions.deafSec})`,
            totalSessions: sql<number>`COUNT(*)`,
            maxSessionSec: sql<number>`MAX(${voiceSessions.durationSec})`,
        })
        .from(voiceSessions)
        .where(
            and(
                eq(voiceSessions.userId, userId),
                sql`strftime('%Y', ${voiceSessions.joinTime}) = ${yearStr}`
            )
        )
        .get() as DBTimeUserStats | undefined;
}

export function getUserRankForYear(userId: string, year: number): number {
    const yearStr = String(year);
    const row = db
        .select({
            rank: sql<number>`rank`,
        })
        .from(
            sql`(
                SELECT user_id, ROW_NUMBER() OVER (ORDER BY SUM(duration_sec) DESC) as rank
                FROM voice_sessions
                WHERE strftime('%Y', join_time) = ${yearStr}
                GROUP BY user_id
            )`
        )
        .where(sql`user_id = ${userId}`)
        .get() as { rank: number } | undefined;
    return row ? row.rank : 99;
}

export function getUserFavChannelForYear(userId: string, year: number): DBTimeFavChan | undefined {
    const yearStr = String(year);
    return db
        .select({
            channelName: voiceSessions.channelName,
            totalSec: sql<number>`SUM(${voiceSessions.durationSec})`,
        })
        .from(voiceSessions)
        .where(
            and(
                eq(voiceSessions.userId, userId),
                sql`strftime('%Y', ${voiceSessions.joinTime}) = ${yearStr}`
            )
        )
        .groupBy(voiceSessions.channelName)
        .orderBy(sql`SUM(${voiceSessions.durationSec}) DESC`)
        .limit(1)
        .get() as DBTimeFavChan | undefined;
}

export function getUserBestDayForYear(userId: string, year: number): DBBestDay | undefined {
    const yearStr = String(year);
    return db
        .select({
            dayStr: sql<string>`strftime('%Y-%m-%d', ${voiceSessions.joinTime})`,
            totalSec: sql<number>`SUM(${voiceSessions.durationSec})`,
        })
        .from(voiceSessions)
        .where(
            and(
                eq(voiceSessions.userId, userId),
                sql`strftime('%Y', ${voiceSessions.joinTime}) = ${yearStr}`
            )
        )
        .groupBy(sql`strftime('%Y-%m-%d', ${voiceSessions.joinTime})`)
        .orderBy(sql`SUM(${voiceSessions.durationSec}) DESC`)
        .limit(1)
        .get() as DBBestDay | undefined;
}

export function getUserBestMonthForYear(userId: string, year: number): DBBestMonth | undefined {
    const yearStr = String(year);
    return db
        .select({
            monthStr: sql<string>`strftime('%m', ${voiceSessions.joinTime})`,
            totalSec: sql<number>`SUM(${voiceSessions.durationSec})`,
        })
        .from(voiceSessions)
        .where(
            and(
                eq(voiceSessions.userId, userId),
                sql`strftime('%Y', ${voiceSessions.joinTime}) = ${yearStr}`
            )
        )
        .groupBy(sql`strftime('%m', ${voiceSessions.joinTime})`)
        .orderBy(sql`SUM(${voiceSessions.durationSec}) DESC`)
        .limit(1)
        .get() as DBBestMonth | undefined;
}

export function getUserMonthlyBreakdown(userId: string, year: number): number[] {
    const yearStr = String(year);
    const rows = db
        .select({
            monthNum: sql<number>`CAST(strftime('%m', ${voiceSessions.joinTime}) AS INTEGER)`,
            totalSec: sql<number>`SUM(${voiceSessions.durationSec})`,
        })
        .from(voiceSessions)
        .where(
            and(
                eq(voiceSessions.userId, userId),
                sql`strftime('%Y', ${voiceSessions.joinTime}) = ${yearStr}`
            )
        )
        .groupBy(sql`strftime('%m', ${voiceSessions.joinTime})`)
        .all() as { monthNum: number; totalSec: number }[];

    const breakdown = new Array(12).fill(0);
    rows.forEach((r) => {
        if (r.monthNum >= 1 && r.monthNum <= 12) {
            breakdown[r.monthNum - 1] = r.totalSec;
        }
    });
    return breakdown;
}

export function getUserTopPartnersForYear(userId: string, year: number, limit = 3): DBPartnerRow[] {
    const yearStr = String(year);
    const userSessions = db
        .select({
            joinTime: voiceSessions.joinTime,
            leaveTime: voiceSessions.leaveTime,
        })
        .from(voiceSessions)
        .where(
            and(
                eq(voiceSessions.userId, userId),
                sql`strftime('%Y', ${voiceSessions.joinTime}) = ${yearStr}`
            )
        )
        .all();

    if (userSessions.length === 0) {
        return [];
    }

    const partnerTimeMap = new Map<string, { userName: string; sec: number }>();

    for (const s of userSessions) {
        const overlapping = db
            .select({
                userId: voiceSessions.userId,
                userName: voiceSessions.userName,
                joinTime: voiceSessions.joinTime,
                leaveTime: voiceSessions.leaveTime,
            })
            .from(voiceSessions)
            .where(
                and(
                    sql`${voiceSessions.userId} != ${userId}`,
                    sql`${voiceSessions.joinTime} < ${s.leaveTime}`,
                    sql`${voiceSessions.leaveTime} > ${s.joinTime}`
                )
            )
            .all();

        const sJoin = new Date(s.joinTime).getTime();
        const sLeave = new Date(s.leaveTime).getTime();

        for (const o of overlapping) {
            const oJoin = new Date(o.joinTime).getTime();
            const oLeave = new Date(o.leaveTime).getTime();
            const overlapMs = Math.max(0, Math.min(sLeave, oLeave) - Math.max(sJoin, oJoin));
            const overlapSec = Math.floor(overlapMs / 1000);

            if (overlapSec > 0) {
                const existing = partnerTimeMap.get(o.userId) || { userName: o.userName, sec: 0 };
                existing.sec += overlapSec;
                existing.userName = o.userName;
                partnerTimeMap.set(o.userId, existing);
            }
        }
    }

    const sorted = Array.from(partnerTimeMap.entries())
        .map(([id, data]) => ({ userId: id, userName: data.userName, overlapSec: data.sec }))
        .sort((a, b) => b.overlapSec - a.overlapSec);

    return sorted.slice(0, limit);
}

export function getYearlyLeaderboard(year: number): DBTimeLeaderboardRow[] {
    const yearStr = String(year);
    return db
        .select({
            userId: voiceSessions.userId,
            userName: voiceSessions.userName,
            totalSec: sql<number>`SUM(${voiceSessions.durationSec})`,
        })
        .from(voiceSessions)
        .where(sql`strftime('%Y', ${voiceSessions.joinTime}) = ${yearStr}`)
        .groupBy(voiceSessions.userId)
        .orderBy(sql`SUM(${voiceSessions.durationSec}) DESC`)
        .all() as DBTimeLeaderboardRow[];
}

export function getMonthlyLeaderboard(year: number, month: number): DBTimeLeaderboardRow[] {
    const yearMonthStr = `${year}-${String(month).padStart(2, "0")}`;
    return db
        .select({
            userId: voiceSessions.userId,
            userName: voiceSessions.userName,
            totalSec: sql<number>`SUM(${voiceSessions.durationSec})`,
        })
        .from(voiceSessions)
        .where(sql`strftime('%Y-%m', ${voiceSessions.joinTime}) = ${yearMonthStr}`)
        .groupBy(voiceSessions.userId)
        .orderBy(sql`SUM(${voiceSessions.durationSec}) DESC`)
        .all() as DBTimeLeaderboardRow[];
}

export function getYearlyServerOverview(year: number): {
    totalSec: number;
    totalActiveSec: number;
    totalDeafSec: number;
    uniqueUsers: number;
    totalSessions: number;
    topChannel: string;
    busiestDay: string;
} {
    const yearStr = String(year);

    const totals = db
        .select({
            totalSec: sql<number>`SUM(${voiceSessions.durationSec})`,
            totalActiveSec: sql<number>`SUM(${voiceSessions.activeSec})`,
            totalDeafSec: sql<number>`SUM(${voiceSessions.deafSec})`,
            uniqueUsers: sql<number>`COUNT(DISTINCT ${voiceSessions.userId})`,
            totalSessions: sql<number>`COUNT(*)`,
        })
        .from(voiceSessions)
        .where(sql`strftime('%Y', ${voiceSessions.joinTime}) = ${yearStr}`)
        .get() as {
        totalSec: number | null;
        totalActiveSec: number | null;
        totalDeafSec: number | null;
        uniqueUsers: number;
        totalSessions: number;
    } | undefined;

    const topChan = db
        .select({
            channelName: voiceSessions.channelName,
            totalSec: sql<number>`SUM(${voiceSessions.durationSec})`,
        })
        .from(voiceSessions)
        .where(sql`strftime('%Y', ${voiceSessions.joinTime}) = ${yearStr}`)
        .groupBy(voiceSessions.channelName)
        .orderBy(sql`SUM(${voiceSessions.durationSec}) DESC`)
        .limit(1)
        .get() as { channelName: string; totalSec: number } | undefined;

    const busiestDayRow = db
        .select({
            dayStr: sql<string>`strftime('%Y-%m-%d', ${voiceSessions.joinTime})`,
            totalSec: sql<number>`SUM(${voiceSessions.durationSec})`,
        })
        .from(voiceSessions)
        .where(sql`strftime('%Y', ${voiceSessions.joinTime}) = ${yearStr}`)
        .groupBy(sql`strftime('%Y-%m-%d', ${voiceSessions.joinTime})`)
        .orderBy(sql`SUM(${voiceSessions.durationSec}) DESC`)
        .limit(1)
        .get() as { dayStr: string; totalSec: number } | undefined;

    return {
        totalSec: totals?.totalSec || 0,
        totalActiveSec: totals?.totalActiveSec || 0,
        totalDeafSec: totals?.totalDeafSec || 0,
        uniqueUsers: totals?.uniqueUsers || 0,
        totalSessions: totals?.totalSessions || 0,
        topChannel: topChan?.channelName || "Inconnu",
        busiestDay: busiestDayRow?.dayStr || "Aucun",
    };
}


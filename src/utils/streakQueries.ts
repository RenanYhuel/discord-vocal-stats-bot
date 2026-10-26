import db from "../database/db";
import { voiceSessions } from "../database/schema";
import { eq, sql, and } from "drizzle-orm";

export interface UserStreakData {
    currentStreak: number;
    bestStreak: number;
    recentDays: { dateStr: string; dayLabel: string; active: boolean }[];
}

export interface DuoStreakData {
    currentStreak: number;
    bestStreak: number;
}

export interface StreakLeaderboardRow {
    userId: string;
    userName: string;
    streak: number;
}

export interface DuoStreakLeaderboardRow {
    user1Id: string;
    user1Name: string;
    user2Id: string;
    user2Name: string;
    streak: number;
}

function getParisDateString(d: Date): string {
    return d.toLocaleDateString("fr-CA", { timeZone: "Europe/Paris" });
}

function getPreviousDayDateString(dateStr: string): string {
    const d = new Date(dateStr + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() - 1);
    return getParisDateString(d);
}

export function getUserStreak(userId: string): UserStreakData {
    const rows = db
        .select({
            dateStr: sql<string>`strftime('%Y-%m-%d', datetime(${voiceSessions.joinTime}, '+2 hours'))`,
        })
        .from(voiceSessions)
        .where(eq(voiceSessions.userId, userId))
        .groupBy(sql`strftime('%Y-%m-%d', datetime(${voiceSessions.joinTime}, '+2 hours'))`)
        .orderBy(sql`strftime('%Y-%m-%d', datetime(${voiceSessions.joinTime}, '+2 hours')) ASC`)
        .all() as { dateStr: string }[];

    if (rows.length === 0) {
        return { currentStreak: 0, bestStreak: 0, recentDays: [] };
    }

    const uniqueDays = new Set(rows.map((r) => r.dateStr));
    const sortedDays = Array.from(uniqueDays).sort();

    let bestStreak = 0;
    let tempStreak = 0;
    let prevDay: string | null = null;

    for (const d of sortedDays) {
        if (!prevDay) {
            tempStreak = 1;
        } else {
            const expectedPrev = getPreviousDayDateString(d);
            if (prevDay === expectedPrev) {
                tempStreak++;
            } else {
                tempStreak = 1;
            }
        }
        if (tempStreak > bestStreak) {
            bestStreak = tempStreak;
        }
        prevDay = d;
    }

    const todayParis = getParisDateString(new Date());
    const yesterdayParis = getPreviousDayDateString(todayParis);

    let currentStreak = 0;
    let checkDate = uniqueDays.has(todayParis) ? todayParis : (uniqueDays.has(yesterdayParis) ? yesterdayParis : null);

    if (checkDate) {
        while (uniqueDays.has(checkDate)) {
            currentStreak++;
            checkDate = getPreviousDayDateString(checkDate);
        }
    }

    const dayNames = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
    const recentDays: { dateStr: string; dayLabel: string; active: boolean }[] = [];
    const now = new Date();

    for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const dStr = getParisDateString(d);
        const dayLabel = dayNames[d.getDay()];
        recentDays.push({
            dateStr: dStr,
            dayLabel,
            active: uniqueDays.has(dStr),
        });
    }

    return { currentStreak, bestStreak, recentDays };
}

export function getDuoStreak(userId1: string, userId2: string): DuoStreakData {
    const s1 = db
        .select({
            joinTime: voiceSessions.joinTime,
            leaveTime: voiceSessions.leaveTime,
        })
        .from(voiceSessions)
        .where(eq(voiceSessions.userId, userId1))
        .all();

    if (s1.length === 0) {
        return { currentStreak: 0, bestStreak: 0 };
    }

    const commonDays = new Set<string>();

    for (const session of s1) {
        const overlaps = db
            .select({
                joinTime: voiceSessions.joinTime,
                leaveTime: voiceSessions.leaveTime,
            })
            .from(voiceSessions)
            .where(
                and(
                    eq(voiceSessions.userId, userId2),
                    sql`${voiceSessions.joinTime} < ${session.leaveTime}`,
                    sql`${voiceSessions.leaveTime} > ${session.joinTime}`
                )
            )
            .all();

        for (const o of overlaps) {
            const sJoin = new Date(session.joinTime).getTime();
            const sLeave = new Date(session.leaveTime).getTime();
            const oJoin = new Date(o.joinTime).getTime();
            const oLeave = new Date(o.leaveTime).getTime();
            const diffSec = Math.floor((Math.min(sLeave, oLeave) - Math.max(sJoin, oJoin)) / 1000);

            if (diffSec >= 30) {
                const dateParis = getParisDateString(new Date(Math.max(sJoin, oJoin)));
                commonDays.add(dateParis);
            }
        }
    }

    const sortedCommonDays = Array.from(commonDays).sort();
    if (sortedCommonDays.length === 0) {
        return { currentStreak: 0, bestStreak: 0 };
    }

    let bestStreak = 0;
    let tempStreak = 0;
    let prevDay: string | null = null;

    for (const d of sortedCommonDays) {
        if (!prevDay) {
            tempStreak = 1;
        } else {
            const expectedPrev = getPreviousDayDateString(d);
            if (prevDay === expectedPrev) {
                tempStreak++;
            } else {
                tempStreak = 1;
            }
        }
        if (tempStreak > bestStreak) {
            bestStreak = tempStreak;
        }
        prevDay = d;
    }

    const todayParis = getParisDateString(new Date());
    const yesterdayParis = getPreviousDayDateString(todayParis);

    let currentStreak = 0;
    let checkDate = commonDays.has(todayParis) ? todayParis : (commonDays.has(yesterdayParis) ? yesterdayParis : null);

    if (checkDate) {
        while (commonDays.has(checkDate)) {
            currentStreak++;
            checkDate = getPreviousDayDateString(checkDate);
        }
    }

    return { currentStreak, bestStreak };
}

export function getStreakLeaderboard(): StreakLeaderboardRow[] {
    const allUsers = db
        .select({
            userId: voiceSessions.userId,
            userName: voiceSessions.userName,
        })
        .from(voiceSessions)
        .groupBy(voiceSessions.userId)
        .all() as { userId: string; userName: string }[];

    const list: StreakLeaderboardRow[] = [];

    for (const u of allUsers) {
        const streakData = getUserStreak(u.userId);
        if (streakData.currentStreak > 0) {
            list.push({
                userId: u.userId,
                userName: u.userName,
                streak: streakData.currentStreak,
            });
        }
    }

    return list.sort((a, b) => b.streak - a.streak);
}

export function getBestStreakLeaderboard(): StreakLeaderboardRow[] {
    const allUsers = db
        .select({
            userId: voiceSessions.userId,
            userName: voiceSessions.userName,
        })
        .from(voiceSessions)
        .groupBy(voiceSessions.userId)
        .all() as { userId: string; userName: string }[];

    const list: StreakLeaderboardRow[] = [];

    for (const u of allUsers) {
        const streakData = getUserStreak(u.userId);
        if (streakData.bestStreak > 0) {
            list.push({
                userId: u.userId,
                userName: u.userName,
                streak: streakData.bestStreak,
            });
        }
    }

    return list.sort((a, b) => b.streak - a.streak);
}

export function getBestDuoStreakLeaderboard(): DuoStreakLeaderboardRow[] {
    const allUsers = db
        .select({
            userId: voiceSessions.userId,
            userName: voiceSessions.userName,
        })
        .from(voiceSessions)
        .groupBy(voiceSessions.userId)
        .all() as { userId: string; userName: string }[];

    const duoList: DuoStreakLeaderboardRow[] = [];

    for (let i = 0; i < allUsers.length; i++) {
        for (let j = i + 1; j < allUsers.length; j++) {
            const u1 = allUsers[i];
            const u2 = allUsers[j];
            const duoData = getDuoStreak(u1.userId, u2.userId);
            if (duoData.bestStreak > 0) {
                duoList.push({
                    user1Id: u1.userId,
                    user1Name: u1.userName,
                    user2Id: u2.userId,
                    user2Name: u2.userName,
                    streak: duoData.bestStreak,
                });
            }
        }
    }

    return duoList.sort((a, b) => b.streak - a.streak);
}


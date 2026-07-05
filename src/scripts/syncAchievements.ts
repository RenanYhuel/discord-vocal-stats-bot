import db from "../database/db";
import logger from "../utils/logger";
import { voiceSessions, userAchievements } from "../database/schema";
import { ACHIEVEMENTS } from "../utils/achievementsList";
import { sql, eq, and } from "drizzle-orm";

export function runHistoricalAchievementsSync(): void {
    logger.info("Debut de la synchronisation historique des succes...");

    const users = db
        .select({
            userId: voiceSessions.userId,
            userName: sql<string>`MAX(${voiceSessions.userName})`
        })
        .from(voiceSessions)
        .groupBy(voiceSessions.userId)
        .all() as { userId: string; userName: string }[];

    let totalInserted = 0;

    for (const user of users) {
        const userId = user.userId;

        const unlockedResult = db
            .select({
                achievementId: userAchievements.achievementId,
            })
            .from(userAchievements)
            .where(eq(userAchievements.userId, userId))
            .all() as { achievementId: string }[];

        const unlockedIds = new Set(unlockedResult.map((r) => r.achievementId));

        const pendingAchievements = ACHIEVEMENTS.filter(
            (a) => !unlockedIds.has(a.id),
        );

        if (pendingAchievements.length === 0) {
            continue;
        }

        const totals = db
            .select({
                totalActiveSec: sql<number>`SUM(${voiceSessions.activeSec})`,
                sessionsCount: sql<number>`COUNT(*)`,
                maxSessionActiveSec: sql<number>`MAX(${voiceSessions.activeSec})`,
            })
            .from(voiceSessions)
            .where(eq(voiceSessions.userId, userId))
            .get() as {
            totalActiveSec: number | null;
            sessionsCount: number | null;
            maxSessionActiveSec: number | null;
        } | undefined;

        const totalActiveSec = totals?.totalActiveSec || 0;
        const sessionsCount = totals?.sessionsCount || 0;
        const maxSessionActiveSec = totals?.maxSessionActiveSec || 0;

        const leaderboard = db
            .select({
                userId: voiceSessions.userId,
                totalSec: sql<number>`SUM(${voiceSessions.durationSec})`,
            })
            .from(voiceSessions)
            .groupBy(voiceSessions.userId)
            .orderBy(sql`SUM(${voiceSessions.durationSec}) DESC`)
            .all() as { userId: string; totalSec: number }[];

        const rankIdx = leaderboard.findIndex((row) => row.userId === userId);
        const targetRank = rankIdx !== -1 ? rankIdx + 1 : 999;

        const allSessions = db
            .select({
                activeSec: voiceSessions.activeSec,
                deafSec: voiceSessions.deafSec,
                joinTime: voiceSessions.joinTime,
                leaveTime: voiceSessions.leaveTime,
            })
            .from(voiceSessions)
            .where(eq(voiceSessions.userId, userId))
            .all() as Array<{
            activeSec: number;
            deafSec: number;
            joinTime: string;
            leaveTime: string;
        }>;

        for (const achievement of pendingAchievements) {
            let hasUnlocked = false;

            if (achievement.category === "time" || achievement.id === "special_1" || achievement.id === "special_2" || achievement.id === "special_3" || achievement.id === "special_4" || achievement.id === "special_5" || achievement.id === "special_8" || achievement.id === "special_12" || achievement.id === "special_13" || achievement.id === "special_18" || achievement.id === "special_19" || achievement.id === "special_20" || achievement.id === "special_22") {
                hasUnlocked = achievement.check({
                    totalActiveSec,
                    sessionsCount,
                    maxSessionActiveSec,
                    sessionActiveSec: 0,
                    sessionDeafSec: 0,
                    joinHour: 12,
                    isSolo: false,
                    targetRank,
                    activeDayOfWeek: 1,
                    totalSessionsLength: sessionsCount,
                    userOverlapCount: 0,
                });
            } else {
                for (const session of allSessions) {
                    const joinDate = new Date(session.joinTime);
                    const joinHour = joinDate.getHours();
                    const activeDayOfWeek = joinDate.getDay();

                    const participants = db
                        .select({
                            userId: voiceSessions.userId,
                        })
                        .from(voiceSessions)
                        .where(
                            and(
                                sql`${voiceSessions.leaveTime} > ${session.joinTime}`,
                                sql`${voiceSessions.joinTime} < ${session.leaveTime}`,
                                sql`${voiceSessions.userId} != ${userId}`,
                            ),
                        )
                        .all() as { userId: string }[];

                    const isSolo = participants.length === 0;
                    const userOverlapCount = new Set(participants.map((p) => p.userId)).size;

                    const satisfies = achievement.check({
                        totalActiveSec,
                        sessionsCount,
                        maxSessionActiveSec,
                        sessionActiveSec: session.activeSec,
                        sessionDeafSec: session.deafSec,
                        joinHour,
                        isSolo,
                        targetRank,
                        activeDayOfWeek,
                        totalSessionsLength: sessionsCount,
                        userOverlapCount,
                    });

                    if (satisfies) {
                        hasUnlocked = true;
                        break;
                    }
                }
            }

            if (hasUnlocked) {
                const timestamp = new Date().toISOString();
                db.insert(userAchievements)
                    .values({
                        userId,
                        achievementId: achievement.id,
                        unlockedAt: timestamp,
                    })
                    .run();
                totalInserted++;
            }
        }
    }

    logger.info(`Synchronisation terminee. ${totalInserted} succes historiques inseres.`);
}

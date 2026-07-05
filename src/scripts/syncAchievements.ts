import db from "../database/db";
import logger from "../utils/logger";
import { voiceSessions, userAchievements } from "../database/schema";
import { ACHIEVEMENTS } from "../utils/achievementsList";
import { sql } from "drizzle-orm";

interface DBSession {
    userId: string;
    activeSec: number;
    deafSec: number;
    joinTime: string;
    leaveTime: string;
}

export function runHistoricalAchievementsSync(): void {
    logger.info("Vidage de la table des succes existants...");
    db.delete(userAchievements).run();

    logger.info("Chargement complet des sessions en memoire...");
    const allSessionsDb = db
        .select({
            userId: voiceSessions.userId,
            activeSec: voiceSessions.activeSec,
            deafSec: voiceSessions.deafSec,
            joinTime: voiceSessions.joinTime,
            leaveTime: voiceSessions.leaveTime,
        })
        .from(voiceSessions)
        .all() as DBSession[];

    const sessionsByUser: Record<string, DBSession[]> = {};
    allSessionsDb.forEach((s) => {
        if (!sessionsByUser[s.userId]) {
            sessionsByUser[s.userId] = [];
        }
        sessionsByUser[s.userId].push(s);
    });

    const users = db
        .select({
            userId: voiceSessions.userId,
            userName: sql<string>`MAX(${voiceSessions.userName})`,
        })
        .from(voiceSessions)
        .groupBy(voiceSessions.userId)
        .all() as { userId: string; userName: string }[];

    logger.info(`Nombre d'utilisateurs à traiter : ${users.length}`);

    const leaderboard = db
        .select({
            userId: voiceSessions.userId,
            totalSec: sql<number>`SUM(${voiceSessions.durationSec})`,
        })
        .from(voiceSessions)
        .groupBy(voiceSessions.userId)
        .orderBy(sql`SUM(${voiceSessions.durationSec}) DESC`)
        .all() as { userId: string; totalSec: number }[];

    let totalInserted = 0;

    for (const user of users) {
        const userId = user.userId;
        const userSessions = sessionsByUser[userId] || [];
        if (userSessions.length === 0) {
            continue;
        }

        logger.info(`Traitement de ${user.userName} (${userSessions.length} sessions)...`);

        userSessions.sort(
            (a, b) => new Date(a.joinTime).getTime() - new Date(b.joinTime).getTime(),
        );

        let runningActiveSec = 0;
        let runningSessionsCount = 0;
        let runningMaxSessionActiveSec = 0;

        const rankIdx = leaderboard.findIndex((row) => row.userId === userId);
        const targetRank = rankIdx !== -1 ? rankIdx + 1 : 999;

        const unlockedIds = new Set<string>();

        for (const session of userSessions) {
            runningActiveSec += session.activeSec;
            runningSessionsCount++;
            if (session.activeSec > runningMaxSessionActiveSec) {
                runningMaxSessionActiveSec = session.activeSec;
            }

            const joinDate = new Date(session.joinTime);
            const joinHour = joinDate.getHours();
            const activeDayOfWeek = joinDate.getDay();

            const overlapping = allSessionsDb.filter(
                (o) =>
                    o.userId !== userId &&
                    o.leaveTime > session.joinTime &&
                    o.joinTime < session.leaveTime,
            );

            const isSolo = overlapping.length === 0;
            const userOverlapCount = new Set(overlapping.map((o) => o.userId)).size;

            for (const achievement of ACHIEVEMENTS) {
                if (unlockedIds.has(achievement.id)) {
                    continue;
                }

                const satisfies = achievement.check({
                    totalActiveSec: runningActiveSec,
                    sessionsCount: runningSessionsCount,
                    maxSessionActiveSec: runningMaxSessionActiveSec,
                    sessionActiveSec: session.activeSec,
                    sessionDeafSec: session.deafSec,
                    joinHour,
                    isSolo,
                    targetRank,
                    activeDayOfWeek,
                    totalSessionsLength: runningSessionsCount,
                    userOverlapCount,
                });

                if (satisfies) {
                    unlockedIds.add(achievement.id);
                    db.insert(userAchievements)
                        .values({
                            userId,
                            achievementId: achievement.id,
                            unlockedAt: session.leaveTime,
                        })
                        .run();
                    totalInserted++;
                }
            }
        }
        logger.info(`-> ${unlockedIds.size} succes valides pour ${user.userName}`);
    }

    logger.info(`Synchronisation terminee. ${totalInserted} succes historiques inseres.`);
}

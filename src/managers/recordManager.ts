import db from "../database/db";
import logger from "../utils/logger";
import config from "../config";
import { Client, EmbedBuilder, TextChannel } from "discord.js";
import {
    formatDurationStandard,
    formatDurationDetailed,
} from "../utils/formatters";
import { voiceSessions, userAchievements } from "../database/schema";
import { sql, eq, and } from "drizzle-orm";
import { ACHIEVEMENTS } from "../utils/achievementsList";

export async function checkAndAnnounceAchievements(
    client: Client,
    userId: string,
    sessionActiveSec: number,
    sessionDeafSec: number,
    joinTimeStr: string,
    leaveTimeStr: string,
): Promise<void> {
    if (!config.statsChannelId) {
        return;
    }

    try {
        const channel = (await client.channels
            .fetch(config.statsChannelId)
            .catch(() => null)) as TextChannel | null;
        if (!channel) {
            return;
        }

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
            return;
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

        const joinDate = new Date(joinTimeStr);
        const joinHour = joinDate.getHours();
        const activeDayOfWeek = joinDate.getDay();

        const participants = db
            .select({
                userId: voiceSessions.userId,
            })
            .from(voiceSessions)
            .where(
                and(
                    sql`${voiceSessions.leaveTime} > ${joinTimeStr}`,
                    sql`${voiceSessions.joinTime} < ${leaveTimeStr}`,
                    sql`${voiceSessions.userId} != ${userId}`,
                ),
            )
            .all() as { userId: string }[];

        const isSolo = participants.length === 0;
        const userOverlapCount = new Set(participants.map((p) => p.userId)).size;

        for (const achievement of pendingAchievements) {
            const hasUnlocked = achievement.check({
                totalActiveSec,
                sessionsCount,
                maxSessionActiveSec,
                sessionActiveSec,
                sessionDeafSec,
                joinHour,
                isSolo,
                targetRank,
                activeDayOfWeek,
                totalSessionsLength: sessionsCount,
                userOverlapCount,
            });

            if (hasUnlocked) {
                const timestamp = new Date().toISOString();
                db.insert(userAchievements)
                    .values({
                        userId,
                        achievementId: achievement.id,
                        unlockedAt: timestamp,
                    })
                    .run();

                const embed = new EmbedBuilder()
                    .setTitle("Succès débloqué !")
                    .setColor(
                        achievement.difficulty === "Platine"
                            ? "#E5E4E2"
                            : achievement.difficulty === "Or"
                              ? "#FEE75C"
                              : achievement.difficulty === "Argent"
                                ? "#BCC6CC"
                                : "#CD7F32",
                    )
                    .setDescription(
                        `Félicitations à <@${userId}> qui vient de remporter le succès :\n\n**${achievement.title}** (${achievement.difficulty})\n*${achievement.description}*`,
                    )
                    .setTimestamp();

                await channel.send({ embeds: [embed] }).catch(() => null);
            }
        }
    } catch (err) {
        logger.error("Erreur lors du calcul ou de l'annonce de succès", err);
    }
}

export async function checkAndAnnounceRecord(
    client: Client,
    userId: string,
    durationSec: number,
    joinTimeStr: string,
    leaveTimeStr: string,
): Promise<void> {
    if (!config.statsChannelId) {
        return;
    }

    try {
        const channel = (await client.channels
            .fetch(config.statsChannelId)
            .catch(() => null)) as TextChannel | null;
        if (!channel) {
            return;
        }

        const serverMaxQuery = db
            .select({
                maxSec: sql<number>`MAX(${voiceSessions.activeSec})`,
            })
            .from(voiceSessions)
            .where(
                and(
                    sql`${voiceSessions.userId} != ${userId}`,
                    sql`${voiceSessions.joinTime} != ${joinTimeStr}`,
                ),
            )
            .get() as { maxSec: number | null } | undefined;

        const serverMax = serverMaxQuery?.maxSec || 0;

        if (durationSec > serverMax && serverMax > 0) {
            const recordJoinTime = new Date(joinTimeStr);
            const recordLeaveTime = new Date(leaveTimeStr);

            const participants = db
                .select({
                    userId: voiceSessions.userId,
                    userName: voiceSessions.userName,
                    joinTime: voiceSessions.joinTime,
                    leaveTime: voiceSessions.leaveTime,
                })
                .from(voiceSessions)
                .where(
                    and(
                        sql`${voiceSessions.leaveTime} > ${joinTimeStr}`,
                        sql`${voiceSessions.joinTime} < ${leaveTimeStr}`,
                        sql`${voiceSessions.userId} != ${userId}`,
                    ),
                )
                .all() as Array<{
                userId: string;
                userName: string;
                joinTime: string;
                leaveTime: string;
            }>;

            const participantLines =
                participants.length > 0
                    ? participants
                          .map((participant) => {
                              const participantJoinTime = new Date(
                                  participant.joinTime,
                              );
                              const participantLeaveTime = new Date(
                                  participant.leaveTime,
                              );
                              const overlapMs = Math.max(
                                  0,
                                  Math.min(
                                      participantLeaveTime.getTime(),
                                      recordLeaveTime.getTime(),
                                  ) -
                                      Math.max(
                                          participantJoinTime.getTime(),
                                          recordJoinTime.getTime(),
                                      ),
                              );
                              const overlapSec = Math.max(
                                  0,
                                  Math.floor(overlapMs / 1000),
                              );
                              return `• <@${participant.userId}> : ${formatDurationStandard(overlapSec)}`;
                          })
                          .join("\n")
                    : "• Aucun autre participant n'a été enregistré pendant cette session.";

            const embed = new EmbedBuilder()
                .setTitle("Nouveau record historique du serveur")
                .setColor("#FEE75C")
                .setDescription(
                    `Ce membre a quitté la session ! Le nouveau record du serveur est donc de ${formatDurationDetailed(durationSec)} et a été réalisé par <@${userId}>.\n\n**Ancienne marque à battre :** \`${formatDurationStandard(serverMax)}\`\n\n**Participants pendant cette session :**\n${participantLines}`,
                )
                .setTimestamp();
            await channel.send({ embeds: [embed] }).catch(() => null);
            return;
        }

        const personalMaxQuery = db
            .select({
                maxSec: sql<number>`MAX(${voiceSessions.activeSec})`,
            })
            .from(voiceSessions)
            .where(
                and(
                    eq(voiceSessions.userId, userId),
                    sql`${voiceSessions.joinTime} != ${joinTimeStr}`,
                ),
            )
            .get() as { maxSec: number | null } | undefined;

        const personalMax = personalMaxQuery?.maxSec || 0;

        if (durationSec > personalMax && personalMax > 0) {
            const embed = new EmbedBuilder()
                .setTitle("Nouveau record personnel")
                .setColor("#57F287")
                .setDescription(
                    `Félicitations à <@${userId}> qui vient de battre son propre record de temps passé en vocal en une seule session !\n\n**Ancien record :** \`${formatDurationStandard(personalMax)}\`\n**Nouveau record personnel :** \`${formatDurationStandard(durationSec)}\``,
                )
                .setTimestamp();
            await channel.send({ embeds: [embed] }).catch(() => null);
            return;
        }
    } catch (err) {
        logger.error("Erreur lors de la vérification/annonce de record", err);
    }
}

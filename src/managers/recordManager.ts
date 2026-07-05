import db from "../database/db";
import logger from "../utils/logger";
import config from "../config";
import { Client, EmbedBuilder, TextChannel } from "discord.js";
import {
    formatDurationStandard,
    formatDurationDetailed,
} from "../utils/formatters";
import { voiceSessions } from "../database/schema";
import { sql, eq, and, lt } from "drizzle-orm";

export async function checkAndAnnounceRecord(
    client: Client,
    userId: string,
    username: string,
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
            .where(sql`${voiceSessions.userId} != ${userId}`)
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
                    lt(voiceSessions.activeSec, durationSec),
                ),
            )
            .get() as { maxSec: number | null } | undefined;

        const personalMax = personalMaxQuery?.maxSec || 0;

        if (durationSec > personalMax && personalMax > 0) {
            const embed = new EmbedBuilder()
                .setTitle("Nouveau record personnel")
                .setColor("#57F287")
                .setDescription(
                    `Félicitations à <@${username}> qui vient de battre son propre record de temps passé en vocal en une seule session !\n\n**Ancien record :** \`${formatDurationStandard(personalMax)}\`\n**Nouveau record personnel :** \`${formatDurationStandard(durationSec)}\``,
                )
                .setTimestamp();
            await channel.send({ embeds: [embed] }).catch(() => null);
            return;
        }
    } catch (err) {
        logger.error("Erreur lors de la vérification/annonce de record", err);
    }
}

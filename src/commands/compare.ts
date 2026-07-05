import {
    SlashCommandBuilder,
    EmbedBuilder,
    ChatInputCommandInteraction,
} from "discord.js";
import db from "../database/db";
import { formatDurationStandard } from "../utils/formatters";
import { voiceSessions } from "../database/schema";
import { sql, eq, and } from "drizzle-orm";

interface DBCompareStats {
    totalSec: number | null;
    activeSec: number;
    sessions: number;
    maxSec: number;
    deafSec: number;
}

interface DBFavoriteChan {
    channelName: string;
    totalSec: number;
}

interface DBCommonTimeQuery {
    commonSec: number;
}

interface DBAloneTimeQuery {
    aloneSec: number | null;
}

export default {
    data: new SlashCommandBuilder()
        .setName("compare")
        .setDescription(
            "Compare en détail les statistiques de présence vocale de deux membres",
        )
        .addUserOption((option) =>
            option
                .setName("membre1")
                .setDescription("Premier membre")
                .setRequired(true),
        )
        .addUserOption((option) =>
            option
                .setName("membre2")
                .setDescription("Second membre")
                .setRequired(true),
        ),
    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        await interaction.deferReply();

        const u1 = interaction.options.getUser("membre1");
        const u2 = interaction.options.getUser("membre2");

        if (!u1 || !u2) {
            await interaction.editReply(
                "Veuillez spécifier deux membres valides.",
            );
            return;
        }

        const stats1 = db
            .select({
                totalSec: sql<number>`SUM(${voiceSessions.durationSec})`,
                activeSec: sql<number>`SUM(${voiceSessions.activeSec})`,
                sessions: sql<number>`COUNT(*)`,
                maxSec: sql<number>`MAX(${voiceSessions.durationSec})`,
                deafSec: sql<number>`SUM(${voiceSessions.deafSec})`,
            })
            .from(voiceSessions)
            .where(eq(voiceSessions.userId, u1.id))
            .get() as DBCompareStats | undefined;

        const stats2 = db
            .select({
                totalSec: sql<number>`SUM(${voiceSessions.durationSec})`,
                activeSec: sql<number>`SUM(${voiceSessions.activeSec})`,
                sessions: sql<number>`COUNT(*)`,
                maxSec: sql<number>`MAX(${voiceSessions.durationSec})`,
                deafSec: sql<number>`SUM(${voiceSessions.deafSec})`,
            })
            .from(voiceSessions)
            .where(eq(voiceSessions.userId, u2.id))
            .get() as DBCompareStats | undefined;

        if (!stats1?.totalSec || !stats2?.totalSec) {
            await interaction.editReply(
                "L'un des deux membres ne possède aucune statistique vocale enregistrée.",
            );
            return;
        }

        const favChan1 = db
            .select({
                channelName: voiceSessions.channelName,
                totalSec: sql<number>`SUM(${voiceSessions.durationSec})`,
            })
            .from(voiceSessions)
            .where(eq(voiceSessions.userId, u1.id))
            .groupBy(voiceSessions.channelName)
            .orderBy(sql`SUM(${voiceSessions.durationSec}) DESC`)
            .limit(1)
            .get() as DBFavoriteChan | undefined;

        const favChan2 = db
            .select({
                channelName: voiceSessions.channelName,
                totalSec: sql<number>`SUM(${voiceSessions.durationSec})`,
            })
            .from(voiceSessions)
            .where(eq(voiceSessions.userId, u2.id))
            .groupBy(voiceSessions.channelName)
            .orderBy(sql`SUM(${voiceSessions.durationSec}) DESC`)
            .limit(1)
            .get() as DBFavoriteChan | undefined;

        const night1 = db
            .select({
                nightSec: sql<number>`SUM(${voiceSessions.durationSec})`,
            })
            .from(voiceSessions)
            .where(
                and(
                    eq(voiceSessions.userId, u1.id),
                    sql`strftime('%H', datetime(${voiceSessions.joinTime}, '+2 hours')) >= '00'`,
                    sql`strftime('%H', datetime(${voiceSessions.joinTime}, '+2 hours')) < '06'`,
                ),
            )
            .get() as { nightSec: number | null } | undefined;

        const night2 = db
            .select({
                nightSec: sql<number>`SUM(${voiceSessions.durationSec})`,
            })
            .from(voiceSessions)
            .where(
                and(
                    eq(voiceSessions.userId, u2.id),
                    sql`strftime('%H', datetime(${voiceSessions.joinTime}, '+2 hours')) >= '00'`,
                    sql`strftime('%H', datetime(${voiceSessions.joinTime}, '+2 hours')) < '06'`,
                ),
            )
            .get() as { nightSec: number | null } | undefined;

        // Calcul du temps passé dans le même salon au même moment (en commun)
        const commonQuery = db
            .select({
                commonSec: sql<number>`
        SUM(
          CASE 
            WHEN strftime('%s', s1.leave_time) <= strftime('%s', s2.leave_time) 
            THEN strftime('%s', s1.leave_time) 
            ELSE strftime('%s', s2.leave_time) 
          END 
          - 
          CASE 
            WHEN strftime('%s', s1.join_time) >= strftime('%s', s2.join_time) 
            THEN strftime('%s', s1.join_time) 
            ELSE strftime('%s', s2.join_time) 
          END
        )
      `,
            })
            .from(sql`voice_sessions s1`)
            .innerJoin(
                sql`voice_sessions s2`,
                sql`s1.channel_name = s2.channel_name 
          AND s1.user_id = ${u1.id} 
          AND s2.user_id = ${u2.id} 
          AND s1.join_time < s2.leave_time 
          AND s1.leave_time > s2.join_time`,
            )
            .get() as DBCommonTimeQuery | undefined;

        // Calcul du temps passé uniquement en tête-à-tête (seulement les deux connectés dans le salon)
        const privateDuoQuery = db
            .select({
                commonSec: sql<number>`
        SUM(
          CASE 
            WHEN strftime('%s', s1.leave_time) <= strftime('%s', s2.leave_time) 
            THEN strftime('%s', s1.leave_time) 
            ELSE strftime('%s', s2.leave_time) 
          END 
          - 
          CASE 
            WHEN strftime('%s', s1.join_time) >= strftime('%s', s2.join_time) 
            THEN strftime('%s', s1.join_time) 
            ELSE strftime('%s', s2.join_time) 
          END
        )
      `,
            })
            .from(sql`voice_sessions s1`)
            .innerJoin(
                sql`voice_sessions s2`,
                sql`s1.channel_name = s2.channel_name 
          AND s1.user_id = ${u1.id} 
          AND s2.user_id = ${u2.id} 
          AND s1.join_time < s2.leave_time 
          AND s1.leave_time > s2.join_time`,
            )
            .where(
                sql`NOT EXISTS (
        SELECT 1 FROM voice_sessions s3 
        WHERE s3.channel_name = s1.channel_name 
          AND s3.user_id NOT IN (${u1.id}, ${u2.id})
          AND s3.join_time < CASE WHEN s1.leave_time <= s2.leave_time THEN s1.leave_time ELSE s2.leave_time END
          AND s3.leave_time > CASE WHEN s1.join_time >= s2.join_time THEN s1.join_time ELSE s2.join_time END
      )`,
            )
            .get() as DBCommonTimeQuery | undefined;

        const alone1Query = db
            .select({
                aloneSec: sql<number>`SUM(alone_sec)`,
            })
            .from(
                sql`(
        WITH sessions_with_lead_lag AS (
          SELECT id, user_id, user_name, channel_name, strftime('%s', join_time) AS join_epoch, strftime('%s', leave_time) AS leave_epoch FROM voice_sessions
        ),
        intervals AS (
          SELECT s1.user_id, s1.user_name, s1.join_epoch, s1.leave_epoch,
            (SELECT MIN(s2.join_epoch) FROM sessions_with_lead_lag s2 WHERE s2.channel_name = s1.channel_name AND s2.user_id != s1.user_id AND s2.join_epoch < s1.leave_epoch AND s2.leave_epoch > s1.join_epoch) AS overlap_start
          FROM sessions_with_lead_lag s1
          WHERE s1.user_id = ${u1.id}
        ),
        alone_durations AS (
          SELECT user_id, user_name, CASE WHEN overlap_start IS NULL THEN (leave_epoch - join_epoch) ELSE 0 END AS alone_sec FROM intervals
        )
        SELECT user_id, user_name, SUM(alone_sec) AS alone_sec FROM alone_durations GROUP BY user_id
      )`,
            )
            .get() as DBAloneTimeQuery | undefined;

        const alone2Query = db
            .select({
                aloneSec: sql<number>`SUM(alone_sec)`,
            })
            .from(
                sql`(
        WITH sessions_with_lead_lag AS (
          SELECT id, user_id, user_name, channel_name, strftime('%s', join_time) AS join_epoch, strftime('%s', leave_time) AS leave_epoch FROM voice_sessions
        ),
        intervals AS (
          SELECT s1.user_id, s1.user_name, s1.join_epoch, s1.leave_epoch,
            (SELECT MIN(s2.join_epoch) FROM sessions_with_lead_lag s2 WHERE s2.channel_name = s1.channel_name AND s2.user_id != s1.user_id AND s2.join_epoch < s1.leave_epoch AND s2.leave_epoch > s1.join_epoch) AS overlap_start
          FROM sessions_with_lead_lag s1
          WHERE s1.user_id = ${u2.id}
        ),
        alone_durations AS (
          SELECT user_id, user_name, CASE WHEN overlap_start IS NULL THEN (leave_epoch - join_epoch) ELSE 0 END AS alone_sec FROM intervals
        )
        SELECT user_id, user_name, SUM(alone_sec) AS alone_sec FROM alone_durations GROUP BY user_id
      )`,
            )
            .get() as DBAloneTimeQuery | undefined;

        const n1 = night1?.nightSec || 0;
        const n2 = night2?.nightSec || 0;

        const t1 = stats1.totalSec;
        const t2 = stats2.totalSec;

        const commonSec = commonQuery?.commonSec || 0;
        const privateDuoSec = privateDuoQuery?.commonSec || 0;
        const alone1Sec = alone1Query?.aloneSec || 0;
        const alone2Sec = alone2Query?.aloneSec || 0;

        let diffText =
            t1 > t2
                ? `<@${u1.id}> a \`${formatDurationStandard(t1 - t2)}\` d'avance sur <@${u2.id}>.`
                : `<@${u2.id}> a \`${formatDurationStandard(t2 - t1)}\` d'avance sur <@${u1.id}>.`;

        diffText += `\nTemps passé ensemble en vocal : \`${formatDurationStandard(commonSec)}\` (dont \`${formatDurationStandard(privateDuoSec)}\` en tête-à-tête).`;

        const ratio1 = Math.round((stats1.deafSec / t1) * 100);
        const ratio2 = Math.round((stats2.deafSec / t2) * 100);

        const embed = new EmbedBuilder()
            .setTitle("Comparatif de Temps Vocal")
            .setDescription(diffText)
            .setColor("#3498DB")
            .addFields([
                {
                    name: `👤 ${u1.username}`,
                    value:
                        `**Temps total :** \`${formatDurationStandard(t1)}\`\n` +
                        `**Temps actif :** \`${formatDurationStandard(stats1.activeSec)}\` (${100 - ratio1}%)\n` +
                        `**Sourdine :** \`${formatDurationStandard(stats1.deafSec)}\` (${ratio1}%)\n` +
                        `**Sessions :** \`${stats1.sessions}\` (~${Math.round(t1 / stats1.sessions / 60)}m/session)\n` +
                        `**Record d'affilée :** \`${formatDurationStandard(stats1.maxSec)}\`\n` +
                        `**Temps seul :** \`${formatDurationStandard(alone1Sec)}\` (${Math.round((alone1Sec / t1) * 100)}%)\n` +
                        `**Salon favori :** ${favChan1 ? `\`#${favChan1.channelName}\` (${formatDurationStandard(favChan1.totalSec)})` : "Aucun"}\n` +
                        `**Nuit (00h-06h) :** \`${formatDurationStandard(n1)}\` (${Math.round((n1 / t1) * 100)}%)`,
                    inline: true,
                },
                {
                    name: `👤 ${u2.username}`,
                    value:
                        `**Temps total :** \`${formatDurationStandard(t2)}\`\n` +
                        `**Temps actif :** \`${formatDurationStandard(stats2.activeSec)}\` (${100 - ratio2}%)\n` +
                        `**Sourdine :** \`${formatDurationStandard(stats2.deafSec)}\` (${ratio2}%)\n` +
                        `**Sessions :** \`${stats2.sessions}\` (~${Math.round(t2 / stats2.sessions / 60)}m/session)\n` +
                        `**Record d'affilée :** \`${formatDurationStandard(stats2.maxSec)}\`\n` +
                        `**Temps seul :** \`${formatDurationStandard(alone2Sec)}\` (${Math.round((alone2Sec / t2) * 100)}%)\n` +
                        `**Salon favori :** ${favChan2 ? `\`#${favChan2.channelName}\` (${formatDurationStandard(favChan2.totalSec)})` : "Aucun"}\n` +
                        `**Nuit (00h-06h) :** \`${formatDurationStandard(n2)}\` (${Math.round((n2 / t2) * 100)}%)`,
                    inline: true,
                },
            ])
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },
};

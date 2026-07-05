import {
    SlashCommandBuilder,
    EmbedBuilder,
    ChatInputCommandInteraction,
} from "discord.js";
import db from "../database/db";
import {
    formatDurationDetailed,
    formatDurationStandard,
    generateWeeklyTextChart,
} from "../utils/formatters";
import { voiceSessions, leaderboardSnapshots } from "../database/schema";
import { sql, eq, and, desc } from "drizzle-orm";

interface DBStatsQuery {
    totalSec: number | null;
    activeSec: number;
    deafSec: number;
    totalSessions: number;
    maxSessionSec: number;
}

interface DBRankQuery {
    rank: number;
}

interface DBFavoriteChan {
    channelName: string;
    totalSec: number;
}

export default {
    data: new SlashCommandBuilder()
        .setName("stats")
        .setDescription(
            "Affiche tes statistiques de présence vocale détaillées (avec gestion sourdine)",
        )
        .addUserOption((option) =>
            option
                .setName("cible")
                .setDescription("Le membre à analyser (optionnel)"),
        ),
    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        await interaction.deferReply();
        const target = interaction.options.getUser("cible") || interaction.user;

        const statsQuery = db
            .select({
                totalSec: sql<number>`SUM(${voiceSessions.durationSec})`,
                activeSec: sql<number>`SUM(${voiceSessions.activeSec})`,
                deafSec: sql<number>`SUM(${voiceSessions.deafSec})`,
                totalSessions: sql<number>`COUNT(*)`,
                maxSessionSec: sql<number>`MAX(${voiceSessions.durationSec})`,
            })
            .from(voiceSessions)
            .where(eq(voiceSessions.userId, target.id))
            .get() as DBStatsQuery | undefined;

        if (!statsQuery || statsQuery.totalSec === null) {
            await interaction.editReply(
                `Aucune statistique enregistrée pour <@${target.id}>.`,
            );
            return;
        }

        const rankQuery = db
            .select({
                rank: sql<number>`rank`,
            })
            .from(
                sql`(
        SELECT user_id, ROW_NUMBER() OVER (ORDER BY SUM(duration_sec) DESC) as rank
        FROM voice_sessions
        GROUP BY user_id
      )`,
            )
            .where(sql`user_id = ${target.id}`)
            .get() as DBRankQuery | undefined;

        const rank = rankQuery ? rankQuery.rank : 99;

        const favoriteChan = db
            .select({
                channelName: voiceSessions.channelName,
                totalSec: sql<number>`SUM(${voiceSessions.durationSec})`,
            })
            .from(voiceSessions)
            .where(eq(voiceSessions.userId, target.id))
            .groupBy(voiceSessions.channelName)
            .orderBy(sql`SUM(${voiceSessions.durationSec}) DESC`)
            .limit(1)
            .get() as DBFavoriteChan | undefined;

        const nightQuery = db
            .select({
                nightSec: sql<number>`SUM(${voiceSessions.durationSec})`,
            })
            .from(voiceSessions)
            .where(
                and(
                    eq(voiceSessions.userId, target.id),
                    sql`strftime('%H', datetime(${voiceSessions.joinTime}, '+2 hours')) >= '00'`,
                    sql`strftime('%H', datetime(${voiceSessions.joinTime}, '+2 hours')) < '06'`,
                ),
            )
            .get() as { nightSec: number | null } | undefined;

        const nightSec = nightQuery?.nightSec || 0;
        const daySec = statsQuery.totalSec - nightSec;

        let trendText = "Stable";
        const snapshots = db
            .select({
                rank: leaderboardSnapshots.rank,
            })
            .from(leaderboardSnapshots)
            .where(
                and(
                    eq(leaderboardSnapshots.userId, target.id),
                    eq(leaderboardSnapshots.periodType, "monthly"),
                ),
            )
            .orderBy(desc(leaderboardSnapshots.id))
            .limit(1)
            .get() as { rank: number } | undefined;

        if (snapshots) {
            const diff = snapshots.rank - rank;
            if (diff > 0) {
                trendText = `📈 +${diff} Place${diff > 1 ? "s" : ""} (par rapport au mois dernier)`;
            } else if (diff < 0) {
                trendText = `📉 ${diff} Place${Math.abs(diff) > 1 ? "s" : ""}`;
            }
        }

        const badges: string[] = [];
        if (nightSec > statsQuery.totalSec * 0.4) {
            badges.push("🦉 **Hibou de Nuit** (>40% de nuit)");
        }
        if (statsQuery.maxSessionSec > 10 * 3600) {
            badges.push("🏃‍♂️ **Marathonien** (Session > 10h)");
        }
        if (statsQuery.totalSessions > 500) {
            badges.push("👥 **Habitué** (>500 sessions)");
        }
        if (statsQuery.deafSec > statsQuery.totalSec * 0.2) {
            badges.push("Le Sourd (>20% du temps en sourdine)");
        }

        const displayTotal =
            rank <= 10
                ? formatDurationDetailed(statsQuery.totalSec)
                : formatDurationStandard(statsQuery.totalSec);
        const displayRecord =
            rank <= 10
                ? formatDurationDetailed(statsQuery.maxSessionSec)
                : formatDurationStandard(statsQuery.maxSessionSec);

        const weeklyChart = generateWeeklyTextChart(target.id);

        const embed = new EmbedBuilder()
            .setTitle(`Statistiques de ${target.username} (Rang #${rank})`)
            .setDescription(`Tendance : ${trendText}`)
            .setThumbnail(target.displayAvatarURL())
            .setColor("#2F3136")
            .addFields([
                {
                    name: "Temps total enregistré",
                    value: displayTotal,
                    inline: false,
                },
                {
                    name: "Répartition AFK (Sourdine Casque)",
                    value: `Temps Actif : \`${formatDurationStandard(statsQuery.activeSec)}\` (${Math.round((statsQuery.activeSec / statsQuery.totalSec) * 100)}%)\nSourdine Casque : \`${formatDurationStandard(statsQuery.deafSec)}\` (${Math.round((statsQuery.deafSec / statsQuery.totalSec) * 100)}%)`,
                },
                {
                    name: "Sessions",
                    value: `\`${statsQuery.totalSessions}\` sessions`,
                    inline: true,
                },
                {
                    name: "Record d'affilée",
                    value: displayRecord,
                    inline: false,
                },
                {
                    name: "Salon favori",
                    value: favoriteChan
                        ? `\`#${favoriteChan.channelName}\` (${formatDurationStandard(favoriteChan.totalSec)})`
                        : "Aucun",
                },
                {
                    name: "Répartition horaire",
                    value: `Journée : \`${formatDurationStandard(daySec)}\` (${Math.round((daySec / statsQuery.totalSec) * 100)}%)\nNuit (00h-06h) : \`${formatDurationStandard(nightSec)}\` (${Math.round((nightSec / statsQuery.totalSec) * 100)}%)`,
                },
                {
                    name: "Activité des 7 derniers jours",
                    value: weeklyChart || "Aucune activité récente.",
                    inline: false,
                },
                {
                    name: "Badges Virtuels",
                    value:
                        badges.length > 0
                            ? badges.join("\n")
                            : "Aucun badge débloqué.",
                },
            ])
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },
};

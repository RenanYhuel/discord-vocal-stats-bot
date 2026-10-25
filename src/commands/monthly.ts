import {
    SlashCommandBuilder,
    EmbedBuilder,
    ChatInputCommandInteraction,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} from "discord.js";
import { formatDurationDetailed, formatDurationStandard } from "../utils/formatters";
import {
    getMonthlyLeaderboard,
    DBTimeLeaderboardRow,
} from "../utils/timeQueries";
import { get2026LockedEmbed } from "../utils/lock2026";
import db from "../database/db";
import { voiceSessions } from "../database/schema";
import { sql, eq, and } from "drizzle-orm";

const MONTH_NAMES = [
    "Janvier",
    "Février",
    "Mars",
    "Avril",
    "Mai",
    "Juin",
    "Juillet",
    "Août",
    "Septembre",
    "Octobre",
    "Novembre",
    "Décembre",
];

export function generateMonthlyLeaderboardEmbed(
    leaderboard: DBTimeLeaderboardRow[],
    page: number,
    totalPages: number,
    year: number,
    month: number
): EmbedBuilder {
    const monthName = MONTH_NAMES[month - 1] || `Mois ${month}`;
    const embed = new EmbedBuilder()
        .setTitle(`Classement Vocal Mensuel - ${monthName} ${year}`)
        .setColor("#EB459E")
        .setFooter({ text: `Page ${page} / ${totalPages} • ${monthName} ${year}` })
        .setTimestamp();

    const startIdx = (page - 1) * 10;
    const pageData = leaderboard.slice(startIdx, startIdx + 10);
    let listText = "";

    pageData.forEach((row, idx) => {
        const position = startIdx + idx + 1;
        const formatTime =
            position <= 10
                ? formatDurationDetailed(row.totalSec)
                : formatDurationStandard(row.totalSec);
        listText += `**#${position}** <@${row.userId}> : ${position <= 10 ? "\n" + formatTime + "\n\n" : `\`${formatTime}\`\n`}`;
    });

    embed.addFields([
        {
            name: "Positions",
            value: listText || "Aucune donnée sur cette page.",
        },
    ]);
    return embed;
}

export function generateMonthlyLeaderboardButtons(
    page: number,
    totalPages: number,
    year: number,
    month: number
): ActionRowBuilder<ButtonBuilder> {
    const prevButton = new ButtonBuilder()
        .setCustomId(`monthly_page_${year}_${month}_${page - 1}`)
        .setLabel("Précédent")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 1);

    const nextButton = new ButtonBuilder()
        .setCustomId(`monthly_page_${year}_${month}_${page + 1}`)
        .setLabel("Suivant")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === totalPages);

    return new ActionRowBuilder<ButtonBuilder>().addComponents(prevButton, nextButton);
}

export default {
    data: new SlashCommandBuilder()
        .setName("monthly")
        .setDescription("Statistiques et classements sur un mois précis")
        .addSubcommand((subcommand) =>
            subcommand
                .setName("leaderboard")
                .setDescription("Classement des membres sur un mois spécifique")
                .addIntegerOption((option) =>
                    option
                        .setName("mois")
                        .setDescription("Le mois à afficher (1 à 12)")
                        .setRequired(true)
                        .addChoices(
                            { name: "Janvier", value: 1 },
                            { name: "Février", value: 2 },
                            { name: "Mars", value: 3 },
                            { name: "Avril", value: 4 },
                            { name: "Mai", value: 5 },
                            { name: "Juin", value: 6 },
                            { name: "Juillet", value: 7 },
                            { name: "Août", value: 8 },
                            { name: "Septembre", value: 9 },
                            { name: "Octobre", value: 10 },
                            { name: "Novembre", value: 11 },
                            { name: "Décembre", value: 12 }
                        )
                )
                .addIntegerOption((option) =>
                    option
                        .setName("annee")
                        .setDescription("L'année (2025 ou 2026)")
                        .setRequired(true)
                        .addChoices(
                            { name: "2026", value: 2026 },
                            { name: "2025", value: 2025 }
                        )
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("me")
                .setDescription("Consulte tes statistiques personnelles (ou d'un membre) sur un mois spécifique")
                .addIntegerOption((option) =>
                    option
                        .setName("mois")
                        .setDescription("Le mois à analyser (1 à 12)")
                        .setRequired(true)
                        .addChoices(
                            { name: "Janvier", value: 1 },
                            { name: "Février", value: 2 },
                            { name: "Mars", value: 3 },
                            { name: "Avril", value: 4 },
                            { name: "Mai", value: 5 },
                            { name: "Juin", value: 6 },
                            { name: "Juillet", value: 7 },
                            { name: "Août", value: 8 },
                            { name: "Septembre", value: 9 },
                            { name: "Octobre", value: 10 },
                            { name: "Novembre", value: 11 },
                            { name: "Décembre", value: 12 }
                        )
                )
                .addIntegerOption((option) =>
                    option
                        .setName("annee")
                        .setDescription("L'année (2025 ou 2026)")
                        .setRequired(true)
                        .addChoices(
                            { name: "2026", value: 2026 },
                            { name: "2025", value: 2025 }
                        )
                )
                .addUserOption((option) =>
                    option
                        .setName("cible")
                        .setDescription("Membre à analyser (optionnel)")
                )
        ),
    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        const subcommand = interaction.options.getSubcommand();
        const month = interaction.options.getInteger("mois", true);
        const year = interaction.options.getInteger("annee", true);
        const monthName = MONTH_NAMES[month - 1] || `Mois ${month}`;

        if (year === 2026) {
            const lockedEmbed = get2026LockedEmbed();
            if (lockedEmbed) {
                await interaction.reply({ embeds: [lockedEmbed], ephemeral: true });
                return;
            }
        }

        if (subcommand === "leaderboard") {
            await interaction.deferReply({ ephemeral: true });

            const leaderboard = getMonthlyLeaderboard(year, month);
            if (leaderboard.length === 0) {
                await interaction.editReply(
                    `Aucune session vocale enregistrée pour **${monthName} ${year}**.`
                );
                return;
            }

            const totalPages = Math.ceil(leaderboard.length / 10);
            const embed = generateMonthlyLeaderboardEmbed(
                leaderboard,
                1,
                totalPages,
                year,
                month
            );
            const buttons = generateMonthlyLeaderboardButtons(
                1,
                totalPages,
                year,
                month
            );

            await interaction.editReply({
                embeds: [embed],
                components: totalPages > 1 ? [buttons] : [],
            });
            return;
        }

        if (subcommand === "me") {
            await interaction.deferReply();

            const target = interaction.options.getUser("cible") || interaction.user;
            const yearMonthStr = `${year}-${String(month).padStart(2, "0")}`;

            const stats = db
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
                        eq(voiceSessions.userId, target.id),
                        sql`strftime('%Y-%m', ${voiceSessions.joinTime}) = ${yearMonthStr}`
                    )
                )
                .get() as {
                totalSec: number | null;
                activeSec: number;
                deafSec: number;
                totalSessions: number;
                maxSessionSec: number;
            } | undefined;

            if (!stats || stats.totalSec === null || stats.totalSec === 0) {
                await interaction.editReply(
                    `Aucune activité vocale enregistrée pour <@${target.id}> en **${monthName} ${year}**.`
                );
                return;
            }

            const rankRow = db
                .select({
                    rank: sql<number>`rank`,
                })
                .from(
                    sql`(
                        SELECT user_id, ROW_NUMBER() OVER (ORDER BY SUM(duration_sec) DESC) as rank
                        FROM voice_sessions
                        WHERE strftime('%Y-%m', join_time) = ${yearMonthStr}
                        GROUP BY user_id
                    )`
                )
                .where(sql`user_id = ${target.id}`)
                .get() as { rank: number } | undefined;

            const rank = rankRow ? rankRow.rank : 99;

            const favChan = db
                .select({
                    channelName: voiceSessions.channelName,
                    totalSec: sql<number>`SUM(${voiceSessions.durationSec})`,
                })
                .from(voiceSessions)
                .where(
                    and(
                        eq(voiceSessions.userId, target.id),
                        sql`strftime('%Y-%m', ${voiceSessions.joinTime}) = ${yearMonthStr}`
                    )
                )
                .groupBy(voiceSessions.channelName)
                .orderBy(sql`SUM(${voiceSessions.durationSec}) DESC`)
                .limit(1)
                .get() as { channelName: string; totalSec: number } | undefined;

            const embed = new EmbedBuilder()
                .setTitle(`Bilan Mensuel : ${monthName} ${year} - ${target.username}`)
                .setColor("#EB459E")
                .setThumbnail(target.displayAvatarURL())
                .setDescription(`Aperçu de la présence vocale de <@${target.id}> durant le mois de **${monthName} ${year}** :`)
                .addFields([
                    {
                        name: "Temps total",
                        value: `**${formatDurationDetailed(stats.totalSec)}**`,
                        inline: false,
                    },
                    {
                        name: "Rang mensuel",
                        value: `**#${rank}** du serveur`,
                        inline: true,
                    },
                    {
                        name: "Sessions",
                        value: `\`${stats.totalSessions}\` sessions\n(Record : \`${formatDurationStandard(stats.maxSessionSec)}\`)`,
                        inline: true,
                    },
                ]);

            if (favChan) {
                const pct = Math.round((favChan.totalSec / stats.totalSec) * 100);
                embed.addFields([
                    {
                        name: "Salon de prédilection",
                        value: `**${favChan.channelName}** (${pct}% de présence)`,
                        inline: true,
                    },
                ]);
            }

            embed.setFooter({ text: `StatsBot • Mensuel ${monthName} ${year}` }).setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        }
    },
};


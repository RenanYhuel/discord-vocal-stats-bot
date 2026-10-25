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
    getYearlyLeaderboard,
    getYearlyServerOverview,
    DBTimeLeaderboardRow,
} from "../utils/timeQueries";
import { get2026LockedEmbed } from "../utils/lock2026";

export function generateAnnualLeaderboardEmbed(
    leaderboard: DBTimeLeaderboardRow[],
    page: number,
    totalPages: number,
    year: number
): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setTitle(`Classement Vocal Annuel - ${year}`)
        .setColor(year === 2026 ? "#F1C40F" : "#3498DB")
        .setFooter({ text: `Page ${page} / ${totalPages} • Année ${year}` })
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

export function generateAnnualLeaderboardButtons(
    page: number,
    totalPages: number,
    year: number
): ActionRowBuilder<ButtonBuilder> {
    const prevButton = new ButtonBuilder()
        .setCustomId(`annual_page_${year}_${page - 1}`)
        .setLabel("Précédent")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 1);

    const nextButton = new ButtonBuilder()
        .setCustomId(`annual_page_${year}_${page + 1}`)
        .setLabel("Suivant")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === totalPages);

    return new ActionRowBuilder<ButtonBuilder>().addComponents(prevButton, nextButton);
}

export default {
    data: new SlashCommandBuilder()
        .setName("annual")
        .setDescription("Statistiques et classements sur une année complète")
        .addSubcommand((subcommand) =>
            subcommand
                .setName("leaderboard")
                .setDescription("Classement des membres sur une année spécifique")
                .addIntegerOption((option) =>
                    option
                        .setName("annee")
                        .setDescription("L'année à afficher (2025 ou 2026)")
                        .setRequired(true)
                        .addChoices(
                            { name: "2026", value: 2026 },
                            { name: "2025", value: 2025 }
                        )
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("server")
                .setDescription("Bilan global d'activité du serveur sur une année")
                .addIntegerOption((option) =>
                    option
                        .setName("annee")
                        .setDescription("L'année à analyser (2025 ou 2026)")
                        .setRequired(true)
                        .addChoices(
                            { name: "2026", value: 2026 },
                            { name: "2025", value: 2025 }
                        )
                )
        ),
    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        const subcommand = interaction.options.getSubcommand();
        const year = interaction.options.getInteger("annee", true);

        if (year === 2026) {
            const lockedEmbed = get2026LockedEmbed();
            if (lockedEmbed) {
                await interaction.reply({ embeds: [lockedEmbed], ephemeral: true });
                return;
            }
        }

        if (subcommand === "leaderboard") {
            await interaction.deferReply();

            const leaderboard = getYearlyLeaderboard(year);
            if (leaderboard.length === 0) {
                await interaction.editReply(`Aucune donnée vocale enregistrée pour l'année ${year}.`);
                return;
            }

            const totalPages = Math.ceil(leaderboard.length / 10);
            const embed = generateAnnualLeaderboardEmbed(leaderboard, 1, totalPages, year);
            const buttons = generateAnnualLeaderboardButtons(1, totalPages, year);

            await interaction.editReply({
                embeds: [embed],
                components: totalPages > 1 ? [buttons] : [],
            });
            return;
        }

        if (subcommand === "server") {
            await interaction.deferReply();

            const overview = getYearlyServerOverview(year);
            if (overview.totalSec === 0) {
                await interaction.editReply(`Aucune donnée vocale enregistrée pour l'année ${year}.`);
                return;
            }

            const totalHours = Math.round((overview.totalSec / 3600) * 10) / 10;

            const embed = new EmbedBuilder()
                .setTitle(`Bilan Communautaire Annuel - ${year}`)
                .setColor("#9B59B6")
                .setDescription(`Rétrospective de l'activité globale du serveur sur l'année **${year}** :`)
                .addFields([
                    {
                        name: "Volume vocal total",
                        value: `**${formatDurationDetailed(overview.totalSec)}**\n*(soit **${totalHours} heures** cumulées par la communauté)*`,
                        inline: false,
                    },
                    {
                        name: "Participants uniques",
                        value: `\`${overview.uniqueUsers}\` membres différents`,
                        inline: true,
                    },
                    {
                        name: "Nombre de sessions",
                        value: `\`${overview.totalSessions}\` sessions`,
                        inline: true,
                    },
                    {
                        name: "Salon le plus populaire",
                        value: `**${overview.topChannel}**`,
                        inline: true,
                    },
                    {
                        name: "Journée record du serveur",
                        value: `\`${overview.busiestDay}\``,
                        inline: true,
                    },
                ])
                .setFooter({ text: `StatsBot • Rapport Annuel ${year}` })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        }
    },
};


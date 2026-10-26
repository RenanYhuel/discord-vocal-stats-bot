import {
    SlashCommandBuilder,
    EmbedBuilder,
    ChatInputCommandInteraction,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} from "discord.js";
import { getUserStreak, getDuoStreak, getStreakLeaderboard, StreakLeaderboardRow } from "../utils/streakQueries";

export function generateStreakLeaderboardEmbed(
    leaderboard: StreakLeaderboardRow[],
    page: number,
    totalPages: number
): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setTitle("Classement des Flammes Vocales Actives")
        .setColor("#FF5722")
        .setFooter({ text: `Page ${page} / ${totalPages} • Séries de jours consécutifs` })
        .setTimestamp();

    const startIdx = (page - 1) * 10;
    const pageData = leaderboard.slice(startIdx, startIdx + 10);
    let listText = "";

    pageData.forEach((row, idx) => {
        const position = startIdx + idx + 1;
        listText += `**#${position}** <@${row.userId}> : 🔥 **${row.streak} jour${row.streak > 1 ? "s" : ""}**\n`;
    });

    embed.addFields([
        {
            name: "Membres avec flammes actives",
            value: listText || "Aucune flamme active actuellement.",
        },
    ]);
    return embed;
}

export function generateStreakLeaderboardButtons(
    page: number,
    totalPages: number
): ActionRowBuilder<ButtonBuilder> {
    const prevButton = new ButtonBuilder()
        .setCustomId(`streak_page_${page - 1}`)
        .setLabel("Précédent")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 1);

    const nextButton = new ButtonBuilder()
        .setCustomId(`streak_page_${page + 1}`)
        .setLabel("Suivant")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === totalPages);

    return new ActionRowBuilder<ButtonBuilder>().addComponents(prevButton, nextButton);
}

export default {
    data: new SlashCommandBuilder()
        .setName("streak")
        .setDescription("Suivi des flammes et séries de jours consécutifs en vocal")
        .addSubcommand((subcommand) =>
            subcommand
                .setName("me")
                .setDescription("Consulte tes flammes vocales (ou celles d'un membre)")
                .addUserOption((option) =>
                    option
                        .setName("cible")
                        .setDescription("Le membre à analyser (optionnel)")
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("duo")
                .setDescription("Consulte les flammes partagées avec un membre en particulier")
                .addUserOption((option) =>
                    option
                        .setName("membre")
                        .setDescription("Le membre partenaire")
                        .setRequired(true)
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("leaderboard")
                .setDescription("Classement des plus longues flammes actives du serveur")
        ),
    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === "leaderboard") {
            await interaction.deferReply({ ephemeral: true });

            const leaderboard = getStreakLeaderboard();
            if (leaderboard.length === 0) {
                await interaction.editReply("Aucun membre ne possède de flamme active en ce moment.");
                return;
            }

            const totalPages = Math.ceil(leaderboard.length / 10);
            const embed = generateStreakLeaderboardEmbed(leaderboard, 1, totalPages);
            const buttons = generateStreakLeaderboardButtons(1, totalPages);

            await interaction.editReply({
                embeds: [embed],
                components: totalPages > 1 ? [buttons] : [],
            });
            return;
        }

        if (subcommand === "me") {
            await interaction.deferReply();
            const target = interaction.options.getUser("cible") || interaction.user;

            const data = getUserStreak(target.id);

            const calendarText = data.recentDays
                .map((d) => `\`${d.dayLabel}\` ${d.active ? "🔥" : "░"}`)
                .join("  ");

            const embed = new EmbedBuilder()
                .setTitle(`Flammes Vocales - ${target.username}`)
                .setColor("#FF5722")
                .setThumbnail(target.displayAvatarURL())
                .setDescription(`Série de présence vocale quotidienne pour <@${target.id}> :`)
                .addFields([
                    {
                        name: "Flamme actuelle",
                        value: `🔥 **${data.currentStreak} jour${data.currentStreak > 1 ? "s" : ""} consécutif${data.currentStreak > 1 ? "s" : ""}**`,
                        inline: true,
                    },
                    {
                        name: "Record personnel",
                        value: `🏆 **${data.bestStreak} jour${data.bestStreak > 1 ? "s" : ""}**`,
                        inline: true,
                    },
                    {
                        name: "7 derniers jours",
                        value: calendarText || "Aucune session récente.",
                        inline: false,
                    },
                ])
                .setFooter({ text: "StatsBot • Une session par jour entretient la flamme !" })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        if (subcommand === "duo") {
            await interaction.deferReply();
            const target = interaction.options.getUser("membre", true);

            if (target.id === interaction.user.id) {
                await interaction.editReply("Tu ne peux pas calculer une flamme de duo avec toi-même !");
                return;
            }

            const duoData = getDuoStreak(interaction.user.id, target.id);

            const embed = new EmbedBuilder()
                .setTitle(`Flammes de Duo : ${interaction.user.username} & ${target.username}`)
                .setColor("#FF9800")
                .setDescription(`Série de jours consécutifs passés ensemble en vocal par <@${interaction.user.id}> et <@${target.id}> :`)
                .addFields([
                    {
                        name: "Flamme commune active",
                        value: duoData.currentStreak > 0
                            ? `🔥 **${duoData.currentStreak} jour${duoData.currentStreak > 1 ? "s" : ""} d'affilée**`
                            : "❄️ **Aucune flamme active** *(connectez-vous ensemble aujourd'hui pour l'allumer !)*",
                        inline: true,
                    },
                    {
                        name: "Record du duo",
                        value: `🏆 **${duoData.bestStreak} jour${duoData.bestStreak > 1 ? "s" : ""}**`,
                        inline: true,
                    },
                ])
                .setFooter({ text: "StatsBot • Flammes partagées" })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        }
    },
};

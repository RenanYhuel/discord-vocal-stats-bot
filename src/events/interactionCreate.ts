import logger from "../utils/logger";
import db from "../database/db";
import {
    generateLeaderboardEmbed,
    generateLeaderboardButtons,
} from "../commands/top";
import {
    generateAnnualLeaderboardEmbed,
    generateAnnualLeaderboardButtons,
} from "../commands/annual";
import {
    generateMonthlyLeaderboardEmbed,
    generateMonthlyLeaderboardButtons,
} from "../commands/monthly";
import {
    generateStreakLeaderboardEmbed,
    generateStreakLeaderboardButtons,
    generateDuoStreakLeaderboardEmbed,
    generateDuoStreakLeaderboardButtons,
} from "../commands/streak";
import { buildWrappedEmbed } from "../commands/wrapped";
import {
    getYearlyLeaderboard,
    getMonthlyLeaderboard,
} from "../utils/timeQueries";
import {
    getStreakLeaderboard,
    getBestStreakLeaderboard,
    getBestDuoStreakLeaderboard,
} from "../utils/streakQueries";
import { CommandInteraction, ButtonInteraction, Client } from "discord.js";
import { voiceSessions } from "../database/schema";
import { sql } from "drizzle-orm";

interface DBLeaderboardRow {
    userId: string;
    userName: string;
    totalSec: number;
}

export default {
    name: "interactionCreate",
    async execute(
        interaction: CommandInteraction | ButtonInteraction,
        client: Client,
    ): Promise<void> {
        if (interaction.isButton()) {
            const customId = interaction.customId;

            if (customId.startsWith("page_")) {
                const [_, pageStr] = customId.split("_");
                await interaction.deferUpdate();
                const page = parseInt(pageStr, 10);

                const leaderboard = db
                    .select({
                        userId: voiceSessions.userId,
                        userName: voiceSessions.userName,
                        totalSec: sql<number>`SUM(${voiceSessions.durationSec})`,
                    })
                    .from(voiceSessions)
                    .groupBy(voiceSessions.userId)
                    .orderBy(sql`SUM(${voiceSessions.durationSec}) DESC`)
                    .all() as DBLeaderboardRow[];

                const totalPages = Math.ceil(leaderboard.length / 10);

                const embed = generateLeaderboardEmbed(
                    leaderboard,
                    page,
                    totalPages,
                );
                const row = generateLeaderboardButtons(page, totalPages);

                await interaction
                    .editReply({ embeds: [embed], components: [row] })
                    .catch(() => null);
                return;
            }

            if (customId.startsWith("annual_page_")) {
                const parts = customId.split("_");
                const year = parseInt(parts[2], 10);
                const page = parseInt(parts[3], 10);

                await interaction.deferUpdate();
                const leaderboard = getYearlyLeaderboard(year);
                const totalPages = Math.ceil(leaderboard.length / 10);

                const embed = generateAnnualLeaderboardEmbed(
                    leaderboard,
                    page,
                    totalPages,
                    year
                );
                const buttons = generateAnnualLeaderboardButtons(
                    page,
                    totalPages,
                    year
                );

                await interaction
                    .editReply({ embeds: [embed], components: [buttons] })
                    .catch(() => null);
                return;
            }

            if (customId.startsWith("monthly_page_")) {
                const parts = customId.split("_");
                const year = parseInt(parts[2], 10);
                const month = parseInt(parts[3], 10);
                const page = parseInt(parts[4], 10);

                await interaction.deferUpdate();
                const leaderboard = getMonthlyLeaderboard(year, month);
                const totalPages = Math.ceil(leaderboard.length / 10);

                const embed = generateMonthlyLeaderboardEmbed(
                    leaderboard,
                    page,
                    totalPages,
                    year,
                    month
                );
                const buttons = generateMonthlyLeaderboardButtons(
                    page,
                    totalPages,
                    year,
                    month
                );

                await interaction
                    .editReply({ embeds: [embed], components: [buttons] })
                    .catch(() => null);
                return;
            }

            if (customId.startsWith("streak_page_")) {
                const parts = customId.split("_");
                const page = parseInt(parts[2], 10);

                await interaction.deferUpdate();
                const leaderboard = getStreakLeaderboard();
                const totalPages = Math.ceil(leaderboard.length / 10);

                const embed = generateStreakLeaderboardEmbed(leaderboard, page, totalPages, false);
                const buttons = generateStreakLeaderboardButtons(page, totalPages, false);

                await interaction
                    .editReply({ embeds: [embed], components: [buttons] })
                    .catch(() => null);
                return;
            }

            if (customId.startsWith("streak_record_page_")) {
                const parts = customId.split("_");
                const page = parseInt(parts[3], 10);

                await interaction.deferUpdate();
                const leaderboard = getBestStreakLeaderboard();
                const totalPages = Math.ceil(leaderboard.length / 10);

                const embed = generateStreakLeaderboardEmbed(leaderboard, page, totalPages, true);
                const buttons = generateStreakLeaderboardButtons(page, totalPages, true);

                await interaction
                    .editReply({ embeds: [embed], components: [buttons] })
                    .catch(() => null);
                return;
            }

            if (customId.startsWith("streak_duo_record_page_")) {
                const parts = customId.split("_");
                const page = parseInt(parts[4], 10);

                await interaction.deferUpdate();
                const leaderboard = getBestDuoStreakLeaderboard();
                const totalPages = Math.ceil(leaderboard.length / 10);

                const embed = generateDuoStreakLeaderboardEmbed(leaderboard, page, totalPages);
                const buttons = generateDuoStreakLeaderboardButtons(page, totalPages);

                await interaction
                    .editReply({ embeds: [embed], components: [buttons] })
                    .catch(() => null);
                return;
            }

            if (customId.startsWith("share_wrapped_")) {
                const parts = customId.split("_");
                const targetUserId = parts[2];
                const year = parseInt(parts[3], 10);

                if (interaction.user.id !== targetUserId) {
                    await interaction.reply({
                        content: "Seul le propriétaire de ce Wrapped peut le partager !",
                        ephemeral: true,
                    });
                    return;
                }

                await interaction.deferReply();
                const embed = buildWrappedEmbed(
                    interaction.user.id,
                    interaction.user.username,
                    interaction.user.displayAvatarURL(),
                    year
                );

                if (!embed) {
                    await interaction.editReply("Impossible de récupérer la rétrospective.");
                    return;
                }

                await interaction.editReply({ embeds: [embed] });
                return;
            }
        }

        if (!interaction.isChatInputCommand()) {
            return;
        }

        const command = (client as any).commands.get(interaction.commandName);
        if (!command) {
            return;
        }

        try {
            logger.info(
                `[COMMAND] Executing command: /${interaction.commandName} by ${interaction.user.tag}`,
            );
            await command.execute(interaction, client);
        } catch (error) {
            logger.error(
                `Erreur d'exécution de la commande /${interaction.commandName}`,
                error,
            );
            if (interaction.replied || interaction.deferred) {
                await interaction
                    .followUp({
                        content:
                            "Une erreur est survenue lors de l'exécution de cette commande.",
                        ephemeral: true,
                    })
                    .catch(() => null);
            } else {
                await interaction
                    .reply({
                        content:
                            "Une erreur est survenue lors de l'exécution de cette commande.",
                        ephemeral: true,
                    })
                    .catch(() => null);
            }
        }
    },
};

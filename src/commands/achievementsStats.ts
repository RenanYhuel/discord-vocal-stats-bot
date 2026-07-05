import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction } from "discord.js";
import db from "../database/db";
import { userAchievements, voiceSessions } from "../database/schema";
import { ACHIEVEMENTS } from "../utils/achievementsList";
import { sql } from "drizzle-orm";

interface DBGlobalStatRow {
    achievementId: string;
    unlockedCount: number;
}

export default {
    data: new SlashCommandBuilder()
        .setName("achievements-stats")
        .setDescription("Affiche les statistiques globales des succes du serveur"),
    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        await interaction.deferReply();

        const globalResult = db
            .select({
                achievementId: userAchievements.achievementId,
                unlockedCount: sql<number>`COUNT(*)`
            })
            .from(userAchievements)
            .groupBy(userAchievements.achievementId)
            .all() as DBGlobalStatRow[];

        const globalStatsMap = new Map<string, number>();
        globalResult.forEach((row) => {
            globalStatsMap.set(row.achievementId, row.unlockedCount);
        });

        const totalUsersResult = db
            .select({
                count: sql<number>`COUNT(DISTINCT ${voiceSessions.userId})`
            })
            .from(voiceSessions)
            .get() as { count: number } | undefined;

        const totalUsers = totalUsersResult?.count || 1;

        const unlockedTotalResult = db
            .select({
                count: sql<number>`COUNT(*)`
            })
            .from(userAchievements)
            .get() as { count: number } | undefined;

        const unlockedTotal = unlockedTotalResult?.count || 0;

        const embed = new EmbedBuilder()
            .setTitle("Statistiques Globales des Succes")
            .setColor("#E67E22")
            .setDescription(`Cumul total : \`${unlockedTotal}\` succes débloqués par \`${totalUsers}\` membres uniques.\n\nVoici les succes les plus rares du serveur :`)
            .setTimestamp();

        const achievementsWithStats = ACHIEVEMENTS.map((a) => {
            const count = globalStatsMap.get(a.id) || 0;
            const ratio = ((count / totalUsers) * 100).toFixed(1);
            return {
                title: a.title,
                difficulty: a.difficulty,
                count,
                ratio: parseFloat(ratio)
            };
        });

        achievementsWithStats.sort((a, b) => a.count - b.count);

        let statsText = "";
        achievementsWithStats.slice(0, 15).forEach((item) => {
            statsText += `**${item.title}** (${item.difficulty}) : débloqué par \`${item.count}\` membre${item.count > 1 ? "s" : ""} (${item.ratio}%)\n`;
        });

        embed.addFields([{ name: "Les 15 succes les plus rares", value: statsText || "Aucun succes débloqué." }]);
        await interaction.editReply({ embeds: [embed] });
    },
};

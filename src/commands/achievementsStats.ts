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

        const embed = new EmbedBuilder()
            .setTitle("Statistiques Globales des Succès")
            .setColor("#E67E22")
            .addFields([
                { name: "Membres participants", value: `\`${totalUsers}\` joueurs`, inline: true },
                { name: "Succès débloqués", value: `\`${unlockedTotal}\` obtentions`, inline: true }
            ])
            .setTimestamp();

        let statsText = "";
        achievementsWithStats.slice(0, 10).forEach((item, idx) => {
            statsText += `**#${idx + 1} ${item.title}** (${item.difficulty})\n↳ débloqué par \`${item.count}\` membre${item.count > 1 ? "s" : ""} (${item.ratio}%)\n\n`;
        });
        embed.addFields([{ name: "Les 10 succès les plus rares du serveur", value: statsText || "Aucun succès débloqué pour le moment." }]);

        const achievementsByDifficulty = {
            Bronze: 0,
            Argent: 0,
            Or: 0,
            Platine: 0
        };

        achievementsWithStats.forEach((a) => {
            if (a.count > 0) {
                achievementsByDifficulty[a.difficulty as keyof typeof achievementsByDifficulty] += a.count;
            }
        });

        let difficultyText = "";
        Object.entries(achievementsByDifficulty).forEach(([diff, count]) => {
            difficultyText += `**${diff}** : \`${count}\` débloqués\n`;
        });
        embed.addFields([{ name: "Cumul par difficulté", value: difficultyText, inline: false }]);

        await interaction.editReply({ embeds: [embed] });
    },
};

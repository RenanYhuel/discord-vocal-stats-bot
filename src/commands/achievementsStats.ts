import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction } from "discord.js";
import db from "../database/db";
import { userAchievements, voiceSessions } from "../database/schema";
import { ACHIEVEMENTS } from "../utils/achievementsList";
import { sql, eq } from "drizzle-orm";

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

        const topHunters = db
            .select({
                userId: userAchievements.userId,
                count: sql<number>`COUNT(*)`
            })
            .from(userAchievements)
            .groupBy(userAchievements.userId)
            .orderBy(sql`COUNT(*) DESC`)
            .limit(3)
            .all() as { userId: string; count: number }[];

        let topHuntersText = "Aucun succès débloqué.";
        if (topHunters.length > 0) {
            topHuntersText = "";
            topHunters.forEach((hunter, idx) => {
                topHuntersText += `#${idx + 1} <@${hunter.userId}> : \`${hunter.count}\` succès débloqués\n`;
            });
        }

        const unlockedStats = ACHIEVEMENTS.map((a) => {
            const count = globalStatsMap.get(a.id) || 0;
            return {
                id: a.id,
                title: a.title,
                difficulty: a.difficulty,
                count
            };
        });

        const unlockedOnly = unlockedStats.filter((a) => a.count > 0);
        const unlockedOnlySorted = [...unlockedOnly].sort((a, b) => a.count - b.count);

        const rarestList = unlockedOnlySorted.slice(0, 5);

        let rarestText = "Aucun succès n'a encore été débloqué.";
        if (rarestList.length > 0) {
            rarestText = "";
            for (const item of rarestList) {
                const holdersResult = db
                    .select({ userId: userAchievements.userId })
                    .from(userAchievements)
                    .where(eq(userAchievements.achievementId, item.id))
                    .limit(3)
                    .all() as { userId: string }[];
                const names = holdersResult.map((h) => `<@${h.userId}>`).join(", ");
                rarestText += `**${item.title}** (${item.difficulty}) : ${names}\n`;
            }
        }

        const embed = new EmbedBuilder()
            .setTitle("Statistiques Globales des Succès")
            .setColor("#E67E22")
            .setDescription(`**${unlockedTotal}** succès débloqués au total par **${totalUsers}** joueurs différents.`)
            .addFields([
                { name: "Top 3 des Chasseurs", value: topHuntersText, inline: false },
                { name: "Les succès les plus rares (Détenteurs)", value: rarestText, inline: false }
            ])
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },
};

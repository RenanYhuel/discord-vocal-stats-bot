import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction } from "discord.js";
import db from "../database/db";
import { userAchievements, voiceSessions } from "../database/schema";
import { ACHIEVEMENTS } from "../utils/achievementsList";
import { eq, sql } from "drizzle-orm";

interface DBGlobalStatRow {
    achievementId: string;
    unlockedCount: number;
}

export default {
    data: new SlashCommandBuilder()
        .setName("achievements")
        .setDescription("Affiche la liste des succes vocaux et ton avancee")
        .addUserOption((option) =>
            option
                .setName("cible")
                .setDescription("Le membre dont vous voulez voir les succes (optionnel)")
        )
        .addStringOption((option) =>
            option
                .setName("categorie")
                .setDescription("Filtrer par type de succes ou voir le global")
                .addChoices(
                    { name: "Stats globales (global)", value: "global" },
                    { name: "Temps total (time)", value: "time" },
                    { name: "Marathons (marathon)", value: "marathon" },
                    { name: "Horaires (schedule)", value: "schedule" },
                    { name: "Sourdine / AFK (afk)", value: "afk" },
                    { name: "Solitaire (solo)", value: "solo" },
                    { name: "Duo (duo)", value: "duo" },
                    { name: "Speciaux (special)", value: "special" }
                )
        ),
    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        await interaction.deferReply();
        const filterCategory = interaction.options.getString("categorie");

        if (filterCategory === "global") {
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
            return;
        }

        const target = interaction.options.getUser("cible") || interaction.user;

        const unlockedResult = db
            .select({
                achievementId: userAchievements.achievementId,
                unlockedAt: userAchievements.unlockedAt,
            })
            .from(userAchievements)
            .where(eq(userAchievements.userId, target.id))
            .all() as { achievementId: string; unlockedAt: string }[];

        const unlockedMap = new Map<string, string>();
        unlockedResult.forEach((r) => {
            unlockedMap.set(r.achievementId, r.unlockedAt);
        });

        let listToShow = ACHIEVEMENTS;
        if (filterCategory) {
            listToShow = ACHIEVEMENTS.filter((a) => a.category === filterCategory);
        }

        const embed = new EmbedBuilder()
            .setTitle(`Succes de ${target.username} (${unlockedResult.length} / ${ACHIEVEMENTS.length})`)
            .setColor("#9B59B6")
            .setTimestamp();

        let descriptionText = "";
        listToShow.forEach((a) => {
            const isUnlocked = unlockedMap.has(a.id);
            const status = isUnlocked ? "[x]" : "[ ]";
            const dateStr = isUnlocked
                ? ` (Obtenu le ${new Date(unlockedMap.get(a.id)!).toLocaleDateString("fr-FR")})`
                : "";
            descriptionText += `**${status} ${a.title}** (${a.difficulty})${dateStr}\n*${a.description}*\n\n`;
        });

        if (descriptionText.length > 4000) {
            descriptionText = descriptionText.substring(0, 3950) + "... (trop de succes à afficher, filtrez par categorie)";
        }

        embed.setDescription(descriptionText || "Aucun succes dans cette categorie.");
        await interaction.editReply({ embeds: [embed] });
    },
};

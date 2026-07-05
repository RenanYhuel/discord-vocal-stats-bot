import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction } from "discord.js";
import db from "../database/db";
import { userAchievements } from "../database/schema";
import { ACHIEVEMENTS } from "../utils/achievementsList";
import { eq } from "drizzle-orm";

export default {
    data: new SlashCommandBuilder()
        .setName("achievements")
        .setDescription("Affiche ta liste de succes vocaux et ton avancee")
        .addUserOption((option) =>
            option
                .setName("cible")
                .setDescription("Le membre dont vous voulez voir les succes (optionnel)")
        )
        .addStringOption((option) =>
            option
                .setName("categorie")
                .setDescription("Filtrer par type de succes")
                .addChoices(
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
        const target = interaction.options.getUser("cible") || interaction.user;
        const filterCategory = interaction.options.getString("categorie");

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

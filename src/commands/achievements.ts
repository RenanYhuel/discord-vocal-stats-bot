import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction } from "discord.js";
import db from "../database/db";
import { userAchievements } from "../database/schema";
import { ACHIEVEMENTS } from "../utils/achievementsList";
import { eq } from "drizzle-orm";

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
        )
        .addBooleanOption((option) =>
            option
                .setName("resume")
                .setDescription("Afficher uniquement un resume de la progression (optionnel)")
        ),
    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        await interaction.deferReply();
        const target = interaction.options.getUser("cible") || interaction.user;
        const filterCategory = interaction.options.getString("categorie");
        const showResume = interaction.options.getBoolean("resume") || false;

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

        if (showResume) {
            const categories = {
                time: { label: "Temps total", unlocked: 0, total: 0 },
                marathon: { label: "Marathons", unlocked: 0, total: 0 },
                schedule: { label: "Horaires", unlocked: 0, total: 0 },
                afk: { label: "Sourdine / AFK", unlocked: 0, total: 0 },
                solo: { label: "Solitaire", unlocked: 0, total: 0 },
                duo: { label: "Duo", unlocked: 0, total: 0 },
                special: { label: "Speciaux", unlocked: 0, total: 0 }
            };

            const difficulties = {
                Bronze: { unlocked: 0, total: 0 },
                Argent: { unlocked: 0, total: 0 },
                Or: { unlocked: 0, total: 0 },
                Platine: { unlocked: 0, total: 0 }
            };

            ACHIEVEMENTS.forEach((a) => {
                const isUnlocked = unlockedMap.has(a.id);
                if (categories[a.category]) {
                    categories[a.category].total++;
                    if (isUnlocked) categories[a.category].unlocked++;
                }
                if (difficulties[a.difficulty]) {
                    difficulties[a.difficulty].total++;
                    if (isUnlocked) difficulties[a.difficulty].unlocked++;
                }
            });

            const sortedUnlocks = unlockedResult
                .map(r => ({ id: r.achievementId, date: new Date(r.unlockedAt) }))
                .sort((a, b) => a.date.getTime() - b.date.getTime());

            let datesText = "Aucun succès débloqué.";
            if (sortedUnlocks.length > 0) {
                const first = sortedUnlocks[0];
                const last = sortedUnlocks[sortedUnlocks.length - 1];
                const firstDetails = ACHIEVEMENTS.find(a => a.id === first.id);
                const lastDetails = ACHIEVEMENTS.find(a => a.id === last.id);
                datesText = `Premier succès : **${firstDetails?.title}** (${first.date.toLocaleDateString("fr-FR")})\nDernier succès : **${lastDetails?.title}** (${last.date.toLocaleDateString("fr-FR")})`;
            }

            const embed = new EmbedBuilder()
                .setTitle(`Progression Succes - ${target.username}`)
                .setColor("#9B59B6")
                .setDescription(`Total débloqué : \`${unlockedResult.length} / ${ACHIEVEMENTS.length}\` (${Math.round((unlockedResult.length / ACHIEVEMENTS.length) * 100)}%)\n\n${datesText}`)
                .setThumbnail(target.displayAvatarURL())
                .setTimestamp();

            let catText = "";
            Object.values(categories).forEach((cat) => {
                catText += `**${cat.label}** : \`${cat.unlocked} / ${cat.total}\`\n`;
            });
            embed.addFields([{ name: "Par Categorie", value: catText, inline: true }]);

            let diffText = "";
            Object.entries(difficulties).forEach(([diff, stat]) => {
                diffText += `**${diff}** : \`${stat.unlocked} / ${stat.total}\`\n`;
            });
            embed.addFields([{ name: "Par Difficulté", value: diffText, inline: true }]);

            await interaction.editReply({ embeds: [embed] });
            return;
        }

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

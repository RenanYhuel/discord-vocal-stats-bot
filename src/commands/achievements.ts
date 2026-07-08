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
        .setDescription("Gestion des succès vocaux du serveur")
        .addSubcommand((subcommand) =>
            subcommand
                .setName("me")
                .setDescription("Affiche ta progression personnelle et tes succès")
                .addStringOption((option) =>
                    option
                        .setName("categorie")
                        .setDescription("Filtrer par type de succès (optionnel)")
                        .addChoices(
                            { name: "Temps total (time)", value: "time" },
                            { name: "Marathons (marathon)", value: "marathon" },
                            { name: "Horaires (schedule)", value: "schedule" },
                            { name: "Sourdine / AFK (afk)", value: "afk" },
                            { name: "Solitaire (solo)", value: "solo" },
                            { name: "Duo (duo)", value: "duo" },
                            { name: "Spéciaux (special)", value: "special" },
                            { name: "Technique (skill)", value: "skill" }
                        )
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("user")
                .setDescription("Affiche la progression d'un autre membre")
                .addUserOption((option) =>
                    option
                        .setName("membre")
                        .setDescription("Le membre à analyser")
                        .setRequired(true)
                )
                .addStringOption((option) =>
                    option
                        .setName("categorie")
                        .setDescription("Filtrer par type de succès (optionnel)")
                        .addChoices(
                            { name: "Temps total (time)", value: "time" },
                            { name: "Marathons (marathon)", value: "marathon" },
                            { name: "Horaires (schedule)", value: "schedule" },
                            { name: "Sourdine / AFK (afk)", value: "afk" },
                            { name: "Solitaire (solo)", value: "solo" },
                            { name: "Duo (duo)", value: "duo" },
                            { name: "Spéciaux (special)", value: "special" },
                            { name: "Technique (skill)", value: "skill" }
                        )
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("server")
                .setDescription("Affiche les statistiques globales des succès du serveur")
        ),
    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === "server") {
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
            return;
        }

        await interaction.deferReply({ ephemeral: true });

        const target = subcommand === "user" 
            ? interaction.options.getUser("membre", true) 
            : interaction.user;

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

        if (!filterCategory) {
            const categories = {
                time: { label: "Temps total", unlocked: 0, total: 0 },
                marathon: { label: "Marathons", unlocked: 0, total: 0 },
                schedule: { label: "Horaires", unlocked: 0, total: 0 },
                afk: { label: "Sourdine / AFK", unlocked: 0, total: 0 },
                solo: { label: "Solitaire", unlocked: 0, total: 0 },
                duo: { label: "Duo", unlocked: 0, total: 0 },
                special: { label: "Spéciaux", unlocked: 0, total: 0 },
                skill: { label: "Technique", unlocked: 0, total: 0 }
            };

            const difficulties = {
                Bronze: { unlocked: 0, total: 0 },
                Argent: { unlocked: 0, total: 0 },
                Or: { unlocked: 0, total: 0 },
                Platine: { unlocked: 0, total: 0 }
            };

            ACHIEVEMENTS.forEach((a) => {
                const isUnlocked = unlockedMap.has(a.id);
                if (categories[a.category as keyof typeof categories]) {
                    categories[a.category as keyof typeof categories].total++;
                    if (isUnlocked) categories[a.category as keyof typeof categories].unlocked++;
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
                .setTitle(`Progression Succès - ${target.username}`)
                .setColor("#9B59B6")
                .setDescription(`Total débloqué : \`${unlockedResult.length} / ${ACHIEVEMENTS.length}\` (${Math.round((unlockedResult.length / ACHIEVEMENTS.length) * 100)}%)\n\n${datesText}`)
                .setThumbnail(target.displayAvatarURL())
                .setTimestamp();

            let catText = "";
            Object.values(categories).forEach((cat) => {
                catText += `**${cat.label}** : \`${cat.unlocked} / ${cat.total}\`\n`;
            });
            embed.addFields([{ name: "Par Catégorie", value: catText, inline: true }]);

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
            .setTitle(`Succès de ${target.username} (${unlockedResult.length} / ${ACHIEVEMENTS.length})`)
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
            descriptionText = descriptionText.substring(0, 3950) + "... (trop de succès à afficher, filtrez par catégorie)";
        }

        embed.setDescription(descriptionText || "Aucun succès dans cette catégorie.");
        await interaction.editReply({ embeds: [embed] });
    },
};

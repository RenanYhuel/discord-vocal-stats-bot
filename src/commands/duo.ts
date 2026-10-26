import {
    SlashCommandBuilder,
    EmbedBuilder,
    ChatInputCommandInteraction,
} from "discord.js";
import { formatDurationStandard } from "../utils/formatters";
import { calculateDuoCompatibility, findBestDuoMatch } from "../utils/duoQueries";

function generateProgressBar(percentage: number): string {
    const totalBars = 12;
    const filledBars = Math.round((percentage / 100) * totalBars);
    const emptyBars = Math.max(0, totalBars - filledBars);
    return `[${"█".repeat(filledBars)}${"░".repeat(emptyBars)}] **${percentage}%**`;
}

export default {
    data: new SlashCommandBuilder()
        .setName("duo")
        .setDescription("Analyse de compatibilité et alchimie vocale entre membres")
        .addSubcommand((subcommand) =>
            subcommand
                .setName("check")
                .setDescription("Calcule l'alchimie et la compatibilité vocale entre deux membres")
                .addUserOption((option) =>
                    option
                        .setName("membre1")
                        .setDescription("Le premier membre")
                        .setRequired(true)
                )
                .addUserOption((option) =>
                    option
                        .setName("membre2")
                        .setDescription("Le second membre (laisser vide pour te comparer avec membre1)")
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("match")
                .setDescription("Trouve automatiquement ton âme sœur vocale actuelle sur le serveur")
                .addUserOption((option) =>
                    option
                        .setName("cible")
                        .setDescription("Membre dont tu cherches le binôme (optionnel)")
                )
        ),
    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === "check") {
            await interaction.deferReply();

            const user1 = interaction.options.getUser("membre1", true);
            const user2 = interaction.options.getUser("membre2") || interaction.user;

            if (user1.id === user2.id) {
                await interaction.editReply("Tu ne peux pas tester ta compatibilité avec la même personne !");
                return;
            }

            const comp = calculateDuoCompatibility(user1.id, user2.id);
            const bar = generateProgressBar(comp.score);

            const embed = new EmbedBuilder()
                .setTitle(`Test de Compatibilité : ${user1.username} & ${user2.username}`)
                .setColor(comp.score >= 70 ? "#E91E63" : comp.score >= 40 ? "#9C27B0" : "#607D8B")
                .setDescription(`Analyse de l'alchimie vocale entre <@${user1.id}> et <@${user2.id}> :\n\n${bar}\n\n**Verdict :** \`${comp.title}\`\n*${comp.description}*`)
                .addFields([
                    {
                        name: "Temps partagé ensemble",
                        value: `**${formatDurationStandard(comp.sharedSeconds)}**`,
                        inline: true,
                    },
                    {
                        name: "Salon de prédilection commun",
                        value: `**${comp.favoriteCommonChannel}**`,
                        inline: true,
                    },
                    {
                        name: "Créneau horaire fétiche",
                        value: `**${comp.commonHourRange}**`,
                        inline: true,
                    },
                ])
                .setFooter({ text: "StatsBot • Algorithme d'affinité vocale" })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        if (subcommand === "match") {
            await interaction.deferReply();
            const target = interaction.options.getUser("cible") || interaction.user;

            const match = findBestDuoMatch(target.id);
            if (!match || match.sharedSeconds === 0) {
                await interaction.editReply(
                    `Aucune correspondance trouvée pour <@${target.id}>. Passez un peu plus de temps en vocal avec d'autres membres !`
                );
                return;
            }

            const bar = generateProgressBar(match.score);

            const embed = new EmbedBuilder()
                .setTitle(`Matchmaker Vocal - ${target.username}`)
                .setColor("#E91E63")
                .setThumbnail(target.displayAvatarURL())
                .setDescription(
                    `Après analyse de toutes les sessions du serveur, le meilleur binôme vocal de <@${target.id}> est :\n\n` +
                    `💘 <@${match.targetUserId}> !\n\n` +
                    `${bar}\n\n` +
                    `• Temps partagé en commun : **${formatDurationStandard(match.sharedSeconds)}**\n` +
                    `• Taux d'affinité globale : **${match.score}%**`
                )
                .setFooter({ text: "StatsBot • Duo-Roulette" })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        }
    },
};

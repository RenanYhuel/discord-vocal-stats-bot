import {
    SlashCommandBuilder,
    EmbedBuilder,
    ChatInputCommandInteraction,
    ChannelType,
    VoiceBasedChannel,
} from "discord.js";
import { getPeakGatherings } from "../utils/peakQueries";
import { formatDurationStandard } from "../utils/formatters";

export default {
    data: new SlashCommandBuilder()
        .setName("peak")
        .setDescription(
            "Affiche les rassemblements vocaux ayant réuni le plus de monde en simultané",
        )
        .addIntegerOption((option) =>
            option
                .setName("limite")
                .setDescription(
                    "Nombre de rassemblements à afficher (défaut : 5, max : 10)",
                )
                .setMinValue(1)
                .setMaxValue(10),
        )
        .addIntegerOption((option) =>
            option
                .setName("annee")
                .setDescription("Filtrer par année (ex : 2026, 2025)")
                .setMinValue(2020)
                .setMaxValue(2030),
        )
        .addChannelOption((option) =>
            option
                .setName("salon")
                .setDescription("Filtrer par salon vocal spécifique")
                .addChannelTypes(
                    ChannelType.GuildVoice,
                    ChannelType.GuildStageVoice,
                ),
        ),

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        await interaction.deferReply();

        const limit = interaction.options.getInteger("limite") || 5;
        const year = interaction.options.getInteger("annee") || undefined;
        const selectedChannel = interaction.options.getChannel(
            "salon",
        ) as VoiceBasedChannel | null;
        const channelName = selectedChannel?.name || undefined;

        const gatherings = getPeakGatherings({
            year,
            channelName,
            limit,
        });

        const embed = new EmbedBuilder().setColor("#F1C40F").setTimestamp();

        let title = "Hall of Fame - Pics d'affluence en vocal";
        if (year && channelName) {
            title = `Pics d'affluence - #${channelName} (${year})`;
        } else if (year) {
            title = `Pics d'affluence - Année ${year}`;
        } else if (channelName) {
            title = `Pics d'affluence - #${channelName}`;
        }

        embed.setTitle(title);

        if (gatherings.length === 0) {
            embed.setDescription(
                "Aucun rassemblement vocal d'au moins 2 personnes n'a été trouvé avec les critères indiqués.",
            );
            await interaction.editReply({ embeds: [embed] });
            return;
        }

        embed.setDescription(
            `Voici le Top ${gatherings.length} des moments où le serveur a réuni le plus de personnes en vocal simultanément :`,
        );

        for (let idx = 0; idx < gatherings.length; idx++) {
            const g = gatherings[idx];
            const peakTimestampSec = Math.floor(g.peakTime / 1000);

            const MAX_SHOWN_USERS = 20;
            const shownUsers = g.peakUsers.slice(0, MAX_SHOWN_USERS);
            const remainingCount = g.peakUsers.length - shownUsers.length;

            let usersText = shownUsers
                .map((u) => `<@${u.userId}>`)
                .join(", ");

            if (remainingCount > 0) {
                usersText += ` et ${remainingCount} autre${remainingCount > 1 ? "s" : ""}`;
            }

            const fieldName = `#${idx + 1} • ${g.peakCount} personnes en même temps (${g.channelName})`;
            const fieldValue =
                `- **Pic atteint le :** <t:${peakTimestampSec}:f> (<t:${peakTimestampSec}:R>)\n` +
                `- **Durée du rassemblement :** \`${formatDurationStandard(g.durationSec)}\`\n` +
                `- **Membres présents au pic (${g.peakCount}) :**\n${usersText}`;

            embed.addFields({
                name: fieldName,
                value: fieldValue,
                inline: false,
            });
        }

        embed.setFooter({
            text: "DVSB • Statistiques Vocales",
        });

        await interaction.editReply({ embeds: [embed] });
    },
};

import {
    SlashCommandBuilder,
    EmbedBuilder,
    ChatInputCommandInteraction,
} from "discord.js";
import { formatDurationDetailed, formatDurationStandard } from "../utils/formatters";
import {
    getUserStatsForYear,
    getUserRankForYear,
    getUserFavChannelForYear,
    getUserBestDayForYear,
    getUserBestMonthForYear,
    getUserTopPartnersForYear,
} from "../utils/timeQueries";
import { get2026LockedEmbed } from "../utils/lock2026";

const MONTH_NAMES = [
    "Janvier",
    "Février",
    "Mars",
    "Avril",
    "Mai",
    "Juin",
    "Juillet",
    "Août",
    "Septembre",
    "Octobre",
    "Novembre",
    "Décembre",
];

export function buildWrappedEmbed(userId: string, username: string, avatarUrl: string, year: number): EmbedBuilder | null {
    const stats = getUserStatsForYear(userId, year);
    if (!stats || stats.totalSec === null || stats.totalSec === 0) {
        return null;
    }

    const rank = getUserRankForYear(userId, year);
    const favChan = getUserFavChannelForYear(userId, year);
    const bestDay = getUserBestDayForYear(userId, year);
    const bestMonth = getUserBestMonthForYear(userId, year);
    const topPartners = getUserTopPartnersForYear(userId, year, 3);

    const totalHours = Math.round((stats.totalSec / 3600) * 10) / 10;
    const yearTotalHours = year % 4 === 0 ? 8784 : 8760;
    const yearPct = ((stats.totalSec / 3600 / yearTotalHours) * 100).toFixed(2);

    let archetype = "Le Pilier du vocal";
    if (stats.totalSessions >= 200) {
        archetype = "L'Habitué insatiable";
    } else if (topPartners.length > 0 && topPartners[0].overlapSec / stats.totalSec >= 0.5) {
        archetype = "Le Duo fusionnel";
    } else if (stats.maxSessionSec >= 28800) {
        archetype = "Le Marathonien de l'extrême";
    } else if (stats.totalSessions <= 15) {
        archetype = "L'Apparition discrète";
    }

    const embed = new EmbedBuilder()
        .setTitle(`Rétrospective Vocale ${year} - ${username}`)
        .setColor(year === 2026 ? "#F1C40F" : "#3498DB")
        .setThumbnail(avatarUrl)
        .setDescription(`Voici le récapitulatif officiel de ton année **${year}** passée avec nous en vocal !`)
        .addFields([
            {
                name: "Temps cumulé",
                value: `**${formatDurationDetailed(stats.totalSec)}**\n*(soit **${totalHours}h** passées en vocal, représentant **${yearPct}%** de l'année entière)*`,
                inline: false,
            },
            {
                name: "Rang de l'année",
                value: `**#${rank}** du serveur en ${year}`,
                inline: true,
            },
            {
                name: "Sessions",
                value: `\`${stats.totalSessions}\` sessions\n(Record : \`${formatDurationStandard(stats.maxSessionSec)}\`)`,
                inline: true,
            },
            {
                name: "Profil vocal",
                value: `**${archetype}**`,
                inline: true,
            },
        ]);

    if (favChan) {
        const chanPct = Math.round((favChan.totalSec / stats.totalSec) * 100);
        embed.addFields([
            {
                name: "Le Quartier Général",
                value: `**${favChan.channelName}** (${chanPct}% de ton temps vocal)`,
                inline: true,
            },
        ]);
    }

    if (bestMonth) {
        const mIdx = parseInt(bestMonth.monthStr, 10) - 1;
        const mName = MONTH_NAMES[mIdx] || bestMonth.monthStr;
        embed.addFields([
            {
                name: "Mois le plus actif",
                value: `**${mName}** avec \`${formatDurationStandard(bestMonth.totalSec)}\``,
                inline: true,
            },
        ]);
    }

    if (bestDay) {
        embed.addFields([
            {
                name: "Journée record",
                value: `\`${bestDay.dayStr}\` avec \`${formatDurationStandard(bestDay.totalSec)}\``,
                inline: true,
            },
        ]);
    }

    if (topPartners.length > 0) {
        const partnerLines = topPartners
            .map((p, idx) => {
                const medal = idx === 0 ? "Âme sœur vocale" : `#${idx + 1}`;
                return `**${medal}** : <@${p.userId}> (${formatDurationStandard(p.overlapSec)} ensemble)`;
            })
            .join("\n");
        embed.addFields([{ name: "Cercle rapproché", value: partnerLines, inline: false }]);
    }

    embed.setFooter({ text: `StatsBot • Rétrospective ${year}` }).setTimestamp();
    return embed;
}

export default {
    data: new SlashCommandBuilder()
        .setName("wrapped")
        .setDescription("Affiche ta rétrospective vocale annuelle personnalisée (style Spotify Wrapped)")
        .addIntegerOption((option) =>
            option
                .setName("annee")
                .setDescription("L'année de la rétrospective (2025 ou 2026)")
                .addChoices(
                    { name: "2026 (Année en cours)", value: 2026 },
                    { name: "2025 (Année passée)", value: 2025 }
                )
        )
        .addUserOption((option) =>
            option
                .setName("cible")
                .setDescription("Le membre dont tu souhaites consulter le Wrapped (optionnel)")
        ),
    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        const requestedYear = interaction.options.getInteger("annee") || 2026;

        if (requestedYear === 2026) {
            const lockedEmbed = get2026LockedEmbed();
            if (lockedEmbed) {
                await interaction.reply({ embeds: [lockedEmbed], ephemeral: true });
                return;
            }
        }

        await interaction.deferReply();

        const target = interaction.options.getUser("cible") || interaction.user;

        const embed = buildWrappedEmbed(
            target.id,
            target.username,
            target.displayAvatarURL(),
            requestedYear
        );

        if (!embed) {
            await interaction.editReply(
                `Aucune statistique vocale enregistrée pour <@${target.id}> sur l'année ${requestedYear}.`
            );
            return;
        }

        await interaction.editReply({ embeds: [embed] });
    },
};

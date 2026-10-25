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
    getUserMonthlyBreakdown,
} from "../utils/timeQueries";
import { get2026LockedEmbed } from "../utils/lock2026";

const MONTH_SHORT = [
    "Jan",
    "Fév",
    "Mar",
    "Avr",
    "Mai",
    "Jui",
    "Juil",
    "Aoû",
    "Sep",
    "Oct",
    "Nov",
    "Déc",
];

export function generateYearlyAsciiChart(monthlySeconds: number[]): string {
    const maxSec = Math.max(...monthlySeconds, 1);
    const barLength = 12;

    const lines = monthlySeconds.map((sec, idx) => {
        const name = MONTH_SHORT[idx].padEnd(4, " ");
        const ratio = sec / maxSec;
        const filled = Math.round(ratio * barLength);
        const empty = Math.max(0, barLength - filled);
        const bar = "█".repeat(filled) + "░".repeat(empty);

        const hours = Math.round((sec / 3600) * 10) / 10;
        const timeLabel = sec > 0 ? `${hours}h` : "-";

        return `${name} [${bar}] ${timeLabel}`;
    });

    return "```text\n" + lines.join("\n") + "\n```";
}

export default {
    data: new SlashCommandBuilder()
        .setName("trends")
        .setDescription("Analyse de l'évolution vocale et comparaisons temporelles")
        .addSubcommand((subcommand) =>
            subcommand
                .setName("year")
                .setDescription("Compare ton évolution vocale entre 2025 et 2026")
                .addUserOption((option) =>
                    option
                        .setName("cible")
                        .setDescription("Membre à comparer (optionnel)")
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("chart")
                .setDescription("Graphique d'activité mensuelle en barres sur une année")
                .addIntegerOption((option) =>
                    option
                        .setName("annee")
                        .setDescription("Année du graphique (2025 ou 2026)")
                        .setRequired(true)
                        .addChoices(
                            { name: "2026", value: 2026 },
                            { name: "2025", value: 2025 }
                        )
                )
                .addUserOption((option) =>
                    option
                        .setName("cible")
                        .setDescription("Membre à analyser (optionnel)")
                )
        ),
    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        const subcommand = interaction.options.getSubcommand();
        const target = interaction.options.getUser("cible") || interaction.user;

        if (subcommand === "chart") {
            const year = interaction.options.getInteger("annee", true);
            if (year === 2026) {
                const lockedEmbed = get2026LockedEmbed();
                if (lockedEmbed) {
                    await interaction.reply({ embeds: [lockedEmbed], ephemeral: true });
                    return;
                }
            }

            await interaction.deferReply();
            const breakdown = getUserMonthlyBreakdown(target.id, year);
            const totalSec = breakdown.reduce((acc, v) => acc + v, 0);

            if (totalSec === 0) {
                await interaction.editReply(
                    `Aucune activité vocale enregistrée pour <@${target.id}> en ${year}.`
                );
                return;
            }

            const chart = generateYearlyAsciiChart(breakdown);

            const embed = new EmbedBuilder()
                .setTitle(`Courbe Vocale Annuelle ${year} - ${target.username}`)
                .setColor(year === 2026 ? "#F1C40F" : "#3498DB")
                .setThumbnail(target.displayAvatarURL())
                .setDescription(
                    `Distribution mois par mois du temps passé en vocal durant l'année **${year}** :\n\n` +
                    chart +
                    `\n**Cumul annuel :** \`${formatDurationDetailed(totalSec)}\``
                )
                .setFooter({ text: `StatsBot • Graphique Annuel ${year}` })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        if (subcommand === "year") {
            const lockedEmbed = get2026LockedEmbed();
            if (lockedEmbed) {
                await interaction.reply({ embeds: [lockedEmbed], ephemeral: true });
                return;
            }

            await interaction.deferReply();

            const s2025 = getUserStatsForYear(target.id, 2025);
            const s2026 = getUserStatsForYear(target.id, 2026);

            const t2025 = s2025?.totalSec || 0;
            const t2026 = s2026?.totalSec || 0;

            if (t2025 === 0 && t2026 === 0) {
                await interaction.editReply(
                    `Aucune donnée vocale trouvée pour <@${target.id}> sur 2025 ou 2026.`
                );
                return;
            }

            const rank2025 = getUserRankForYear(target.id, 2025);
            const rank2026 = getUserRankForYear(target.id, 2026);

            const fav2025 = getUserFavChannelForYear(target.id, 2025);
            const fav2026 = getUserFavChannelForYear(target.id, 2026);

            let diffText = "";
            if (t2025 > 0 && t2026 > 0) {
                const diffSec = t2026 - t2025;
                const diffPct = Math.round(((t2026 - t2025) / t2025) * 100);
                if (diffSec > 0) {
                    diffText = `**+${formatDurationStandard(diffSec)}** (+${diffPct}%) par rapport à 2025`;
                } else if (diffSec < 0) {
                    diffText = `**-${formatDurationStandard(Math.abs(diffSec))}** (${diffPct}%) par rapport à 2025`;
                } else {
                    diffText = "Temps exactement identique à la seconde près !";
                }
            } else if (t2025 === 0 && t2026 > 0) {
                diffText = "Nouvelle recrue active en 2026 (aucune session en 2025) !";
            } else {
                diffText = "Actif en 2025 mais aucune présence enregistrée en 2026.";
            }

            const embed = new EmbedBuilder()
                .setTitle(`Évolution 2025 vs 2026 - ${target.username}`)
                .setColor("#2ECC71")
                .setThumbnail(target.displayAvatarURL())
                .setDescription(`Comparaison directe de la présence vocale de <@${target.id}> :`)
                .addFields([
                    {
                        name: "Évolution globale",
                        value: diffText,
                        inline: false,
                    },
                    {
                        name: "Année 2025",
                        value:
                            `• Temps : **${formatDurationStandard(t2025)}**\n` +
                            `• Rang : **#${rank2025}**\n` +
                            `• Sessions : \`${s2025?.totalSessions || 0}\`\n` +
                            `• QG : **${fav2025?.channelName || "N/A"}**`,
                        inline: true,
                    },
                    {
                        name: "Année 2026",
                        value:
                            `• Temps : **${formatDurationStandard(t2026)}**\n` +
                            `• Rang : **#${rank2026}**\n` +
                            `• Sessions : \`${s2026?.totalSessions || 0}\`\n` +
                            `• QG : **${fav2026?.channelName || "N/A"}**`,
                        inline: true,
                    },
                ])
                .setFooter({ text: "StatsBot • Comparateur Temporel" })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        }
    },
};


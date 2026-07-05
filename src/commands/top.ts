import { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, CommandInteraction } from "discord.js";
import db from "../../src/database/db";
import { getRevealedRanksCount } from "../../src/managers/revealManager";
import { formatDurationDetailed, formatDurationStandard } from "../../src/utils/formatters";
import { voiceSessions } from "../../src/database/schema";
import { sql } from "drizzle-orm";

interface DBLeaderboardRow {
  userId: string;
  userName: string;
  totalSec: number;
}

export function generateLeaderboardEmbed(leaderboard: DBLeaderboardRow[], page: number, totalPages: number, revealedRanks: number): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle("🏆 Classement Vocal Général")
    .setColor("#5865F2")
    .setDescription(revealedRanks < 10 ? "ℹ️ *Dévoilement progressif actif.*" : "✨ *Toutes les places sont révélées !*")
    .setFooter({ text: `Page ${page} / ${totalPages}` })
    .setTimestamp();

  const startIdx = (page - 1) * 10;
  const pageData = leaderboard.slice(startIdx, startIdx + 10);
  let listText = "";

  pageData.forEach((row, idx) => {
    const position = startIdx + idx + 1;
    const formatTime = position <= 10 ? formatDurationDetailed(row.totalSec) : formatDurationStandard(row.totalSec);

    if (position <= 10) {
      const rankToReveal = 11 - position;
      if (revealedRanks >= rankToReveal) {
        listText += `**#${position}** <@${row.userId}> :\n${formatTime}\n\n`;
      } else {
        listText += `**#${position}** 🔒 ||*Rang masqué (Dévoilement progressif)*||\n\n`;
      }
    } else {
      listText += `**#${position}** <@${row.userId}> : \`${formatTime}\`\n`;
    }
  });

  embed.addFields([{ name: "Positions", value: listText || "Aucune donnée sur cette page." }]);
  return embed;
}

export function generateLeaderboardButtons(page: number, totalPages: number): ActionRowBuilder<ButtonBuilder> {
  const prevButton = new ButtonBuilder()
    .setCustomId(`page_${page - 1}`)
    .setLabel("◀️ Précédent")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(page === 1);

  const nextButton = new ButtonBuilder()
    .setCustomId(`page_${page + 1}`)
    .setLabel("Suivant ▶️")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(page === totalPages);

  return new ActionRowBuilder<ButtonBuilder>().addComponents(prevButton, nextButton);
}

export default {
  data: new SlashCommandBuilder()
    .setName("top")
    .setDescription("Classement général des membres en vocal (Reveal progressif)"),
  async execute(interaction: CommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    const leaderboard = db.select({
      userId: voiceSessions.userId,
      userName: voiceSessions.userName,
      totalSec: sql<number>`SUM(${voiceSessions.durationSec})`
    })
    .from(voiceSessions)
    .groupBy(voiceSessions.userId)
    .orderBy(sql`SUM(${voiceSessions.durationSec}) DESC`)
    .all() as DBLeaderboardRow[];

    const revealedRanks = getRevealedRanksCount();
    const totalPages = Math.ceil(leaderboard.length / 10) || 1;

    const embed = generateLeaderboardEmbed(leaderboard, 1, totalPages, revealedRanks);
    const row = generateLeaderboardButtons(1, totalPages);

    await interaction.editReply({ embeds: [embed], components: [row] });
  }
};

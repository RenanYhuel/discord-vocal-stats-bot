import { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, CommandInteraction } from "discord.js";
import db from "../database/db";
import { formatDurationDetailed, formatDurationStandard } from "../utils/formatters";
import { voiceSessions } from "../database/schema";
import { sql } from "drizzle-orm";

interface DBLeaderboardRow {
  userId: string;
  userName: string;
  totalSec: number;
}

export function generateLeaderboardEmbed(leaderboard: DBLeaderboardRow[], page: number, totalPages: number): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle("🏆 Classement Vocal Général")
    .setColor("#5865F2")
    .setFooter({ text: `Page ${page} / ${totalPages}` })
    .setTimestamp();

  const startIdx = (page - 1) * 10;
  const pageData = leaderboard.slice(startIdx, startIdx + 10);
  let listText = "";

  pageData.forEach((row, idx) => {
    const position = startIdx + idx + 1;
    const formatTime = position <= 10 ? formatDurationDetailed(row.totalSec) : formatDurationStandard(row.totalSec);
    listText += `**#${position}** <@${row.userId}> : ${position <= 10 ? "\n" + formatTime + "\n\n" : `\`${formatTime}\`\n`}`;
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
    .setDescription("Classement général des membres en vocal"),
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

    const totalPages = Math.ceil(leaderboard.length / 10) || 1;

    const embed = generateLeaderboardEmbed(leaderboard, 1, totalPages);
    const row = generateLeaderboardButtons(1, totalPages);

    await interaction.editReply({ embeds: [embed], components: [row] });
  }
};

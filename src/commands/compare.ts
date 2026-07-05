import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction } from "discord.js";
import db from "../../src/database/db";
import { formatDurationStandard } from "../../src/utils/formatters";
import { voiceSessions } from "../../src/database/schema";
import { sql, eq } from "drizzle-orm";

interface DBCompareStats {
  totalSec: number | null;
  sessions: number;
  maxSec: number;
  deafSec: number;
}

export default {
  data: new SlashCommandBuilder()
    .setName("compare")
    .setDescription("Compare en détail les statistiques de présence vocale de deux membres")
    .addUserOption(option => option.setName("membre1").setDescription("Premier membre").setRequired(true))
    .addUserOption(option => option.setName("membre2").setDescription("Second membre").setRequired(true)),
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();
    
    const u1 = interaction.options.getUser("membre1");
    const u2 = interaction.options.getUser("membre2");

    if (!u1 || !u2) {
      await interaction.editReply("Veuillez spécifier deux membres valides.");
      return;
    }

    const stats1 = db.select({
      totalSec: sql<number>`SUM(${voiceSessions.durationSec})`,
      sessions: sql<number>`COUNT(*)`,
      maxSec: sql<number>`MAX(${voiceSessions.durationSec})`,
      deafSec: sql<number>`SUM(${voiceSessions.deafSec})`
    })
    .from(voiceSessions)
    .where(eq(voiceSessions.userId, u1.id))
    .get() as DBCompareStats | undefined;

    const stats2 = db.select({
      totalSec: sql<number>`SUM(${voiceSessions.durationSec})`,
      sessions: sql<number>`COUNT(*)`,
      maxSec: sql<number>`MAX(${voiceSessions.durationSec})`,
      deafSec: sql<number>`SUM(${voiceSessions.deafSec})`
    })
    .from(voiceSessions)
    .where(eq(voiceSessions.userId, u2.id))
    .get() as DBCompareStats | undefined;

    if (!stats1?.totalSec || !stats2?.totalSec) {
      await interaction.editReply("L'un des deux membres ne possède aucune statistique vocale enregistrée.");
      return;
    }

    const t1 = stats1.totalSec;
    const t2 = stats2.totalSec;
    
    const diffText = t1 > t2 
      ? `📈 <@${u1.id}> a \`${formatDurationStandard(t1 - t2)}\` d'avance sur <@${u2.id}>.`
      : `📈 <@${u2.id}> a \`${formatDurationStandard(t2 - t1)}\` d'avance sur <@${u1.id}>.`;

    const embed = new EmbedBuilder()
      .setTitle("📊 Comparatif de Temps Vocal")
      .setDescription(diffText)
      .setColor("#3498DB")
      .addFields([
        { name: `👤 ${u1.username}`, value: `**Temps total :** ${formatDurationStandard(t1)}\n**Sessions :** \`${stats1.sessions}\` (~${Math.round(t1/stats1.sessions/60)}m/session)\n**Record :** \`${formatDurationStandard(stats1.maxSec)}\`\n**Temps Sourdine Casque :** \`${formatDurationStandard(stats1.deafSec)}\` (${Math.round((stats1.deafSec/t1)*100)}%)`, inline: true },
        { name: `👤 ${u2.username}`, value: `**Temps total :** ${formatDurationStandard(t2)}\n**Sessions :** \`${stats2.sessions}\` (~${Math.round(t2/stats2.sessions/60)}m/session)\n**Record :** \`${formatDurationStandard(stats2.maxSec)}\`\n**Temps Sourdine Casque :** \`${formatDurationStandard(stats2.deafSec)}\` (${Math.round((stats2.deafSec/t2)*100)}%)`, inline: true }
      ])
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
};

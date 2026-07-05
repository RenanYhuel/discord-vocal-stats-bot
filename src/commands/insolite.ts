import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction } from "discord.js";
import db from "../../src/database/db";
import { formatDurationStandard } from "../../src/utils/formatters";
import { voiceSessions } from "../../src/database/schema";
import { sql } from "drizzle-orm";

interface DBNightQuery {
  userName: string;
  userId: string;
  totalSec: number;
}

interface DBHopperQuery {
  userName: string;
  userId: string;
  sessions: number;
}

interface DBAloneQuery {
  userId: string;
  userName: string;
  totalSec: number;
}

interface DBMarathonQuery {
  userName: string;
  userId: string;
  channelName: string;
  durationSec: number;
  startDate: string;
}

export default {
  data: new SlashCommandBuilder()
    .setName("insolite")
    .setDescription("Classements amusants et statistiques insolites du serveur")
    .addStringOption(option => 
      option.setName("classement")
        .setDescription("Le type de classement insolite")
        .setRequired(true)
        .addChoices(
          { name: "🦉 Les insomniaques (00h-06h)", value: "night" },
          { name: "🚶‍♂️ Le Roi des Déco/Reco", value: "hopper" },
          { name: "👤 Les Solitaires (Temps passé seul)", value: "alone" },
          { name: "🛌 Les plus longues sessions d'affilée", value: "marathon" }
        )
    ),
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();
    const type = interaction.options.getString("classement");
    const embed = new EmbedBuilder().setColor("#FEE75C").setTimestamp();

    if (type === "night") {
      const data = db.select({
        userName: voiceSessions.userName,
        userId: voiceSessions.userId,
        totalSec: sql<number>`SUM(${voiceSessions.durationSec})`
      })
      .from(voiceSessions)
      .where(sql`strftime('%H', datetime(${voiceSessions.joinTime}, '+2 hours')) >= '00' AND strftime('%H', datetime(${voiceSessions.joinTime}, '+2 hours')) < '06'`)
      .groupBy(voiceSessions.userId)
      .orderBy(sql`SUM(${voiceSessions.durationSec}) DESC`)
      .limit(5)
      .all() as DBNightQuery[];

      let text = "";
      data.forEach((row, idx) => {
        text += `**#${idx+1}** <@${row.userId}> : \`${formatDurationStandard(row.totalSec)}\`\n`;
      });
      embed.setTitle("🦉 Les insomniaques de nuit (00h-06h)").setDescription(text || "Aucune donnée");
    }

    else if (type === "hopper") {
      const data = db.select({
        userName: voiceSessions.userName,
        userId: voiceSessions.userId,
        sessions: sql<number>`COUNT(*)`
      })
      .from(voiceSessions)
      .groupBy(voiceSessions.userId)
      .orderBy(sql`COUNT(*) DESC`)
      .limit(5)
      .all() as DBHopperQuery[];

      let text = "";
      data.forEach((row, idx) => {
        text += `**#${idx+1}** <@${row.userId}> : \`${row.sessions}\` connexions vocales\n`;
      });
      embed.setTitle("🚶‍♂️ Le Roi de la Connexion / Déconnexion").setDescription(text || "Aucune donnée");
    }

    else if (type === "alone") {
      const data = db.select({
        userId: sql<string>`user_id`,
        userName: sql<string>`user_name`,
        totalSec: sql<number>`SUM(total_sec)`
      })
      .from(
        sql`(
          WITH sessions_with_lead_lag AS (
            SELECT id, user_id, user_name, channel_name, strftime('%s', join_time) as join_epoch, strftime('%s', leave_time) as leave_epoch FROM voice_sessions
          ),
          intervals AS (
            SELECT s1.user_id, s1.user_name, s1.join_epoch, s1.leave_epoch,
              (SELECT MIN(s2.join_epoch) FROM sessions_with_lead_lag s2 WHERE s2.channel_name = s1.channel_name AND s2.user_id != s1.user_id AND s2.join_epoch < s1.leave_epoch AND s2.leave_epoch > s1.join_epoch) as overlap_start
            FROM sessions_with_lead_lag s1
          ),
          alone_durations AS (
            SELECT user_id, user_name, CASE WHEN overlap_start IS NULL THEN (leave_epoch - join_epoch) ELSE 0 END as alone_sec FROM intervals
          )
          SELECT user_id, user_name, SUM(alone_sec) as total_sec FROM alone_durations GROUP BY user_id
        )`
      )
      .groupBy(sql`user_id`)
      .orderBy(sql`total_sec DESC`)
      .limit(5)
      .all() as DBAloneQuery[];

      let text = "";
      data.forEach((row, idx) => {
        text += `**#${idx+1}** <@${row.userId}> : \`${formatDurationStandard(row.totalSec)}\` seul en salon\n`;
      });
      embed.setTitle("👤 Les Solitaires (Sessions 100% seuls du début à la fin)").setDescription(text || "Aucune donnée");
    }

    else if (type === "marathon") {
      const data = db.select({
        userName: voiceSessions.userName,
        userId: voiceSessions.userId,
        channelName: voiceSessions.channelName,
        durationSec: voiceSessions.durationSec,
        startDate: sql<string>`datetime(${voiceSessions.joinTime}, '+2 hours')`
      })
      .from(voiceSessions)
      .orderBy(sql`${voiceSessions.durationSec} DESC`)
      .limit(5)
      .all() as DBMarathonQuery[];

      let text = "";
      data.forEach((row, idx) => {
        text += `**#${idx+1}** <@${row.userId}> : \`${formatDurationStandard(row.durationSec)}\` (dans \`#${row.channelName}\` le ${new Date(row.startDate).toLocaleDateString("fr-FR")})\n`;
      });
      embed.setTitle("🛌 Les plus longues sessions individuelles ininterrompues").setDescription(text || "Aucune donnée");
    }

    await interaction.editReply({ embeds: [embed] });
  }
};

import { SlashCommandBuilder, EmbedBuilder, CommandInteraction } from "discord.js";
import db from "../database/db";
import logger from "../utils/logger";
import { formatDurationDetailed } from "../utils/formatters";
import { voiceSessions } from "../database/schema";
import { sql } from "drizzle-orm";

interface DBBadgeQuerySimple {
  userId: string;
  nightSec: number;
}
interface DBBadgeQueryMax {
  userId: string;
  maxSec: number;
}
interface DBBadgeQueryMorning {
  userId: string;
  morningSec: number;
}
interface DBBadgeQueryUnique {
  userId: string;
  uniqueChans: number;
}
interface DBBadgeQueryCount {
  userId: string;
  sessionsCount: number;
}
interface DBBadgeQueryShort {
  userId: string;
  shortCount: number;
}
interface DBBadgeQueryLong {
  userId: string;
  longCount: number;
}
interface DBBadgeQueryWeekend {
  userId: string;
  weekendSec: number;
}
interface DBBadgeQueryEvents {
  userId: string;
  totalEvents: number;
}
interface DBBadgeQueryHost {
  userId: string;
  hostSec: number;
}

export default {
  data: new SlashCommandBuilder()
    .setName("badges")
    .setDescription("Découvre les rôles virtuels et trophées décernés aux membres"),
  async execute(interaction: CommandInteraction): Promise<void> {
    await interaction.deferReply();
    try {
      const topNight = db.select({
        userId: voiceSessions.userId,
        nightSec: sql<number>`SUM(${voiceSessions.durationSec})`
      })
      .from(voiceSessions)
      .where(sql`strftime('%H', datetime(${voiceSessions.joinTime}, '+2 hours')) >= '00' AND strftime('%H', datetime(${voiceSessions.joinTime}, '+2 hours')) < '06'`)
      .groupBy(voiceSessions.userId)
      .orderBy(sql`SUM(${voiceSessions.durationSec}) DESC`)
      .limit(1)
      .get() as DBBadgeQuerySimple | undefined;

      const topMarathon = db.select({
        userId: voiceSessions.userId,
        maxSec: sql<number>`MAX(${voiceSessions.durationSec})`
      })
      .from(voiceSessions)
      .groupBy(voiceSessions.userId)
      .orderBy(sql`MAX(${voiceSessions.durationSec}) DESC`)
      .limit(1)
      .get() as DBBadgeQueryMax | undefined;

      const topMorning = db.select({
        userId: voiceSessions.userId,
        morningSec: sql<number>`SUM(${voiceSessions.durationSec})`
      })
      .from(voiceSessions)
      .where(sql`strftime('%H', datetime(${voiceSessions.joinTime}, '+2 hours')) >= '06' AND strftime('%H', datetime(${voiceSessions.joinTime}, '+2 hours')) < '12'`)
      .groupBy(voiceSessions.userId)
      .orderBy(sql`SUM(${voiceSessions.durationSec}) DESC`)
      .limit(1)
      .get() as DBBadgeQueryMorning | undefined;

      const topCameleon = db.select({
        userId: voiceSessions.userId,
        uniqueChans: sql<number>`COUNT(DISTINCT ${voiceSessions.channelName})`
      })
      .from(voiceSessions)
      .groupBy(voiceSessions.userId)
      .orderBy(sql`COUNT(DISTINCT ${voiceSessions.channelName}) DESC`)
      .limit(1)
      .get() as DBBadgeQueryUnique | undefined;

      const topLone = db.select({
        userId: voiceSessions.userId,
        sessionsCount: sql<number>`COUNT(*)`
      })
      .from(voiceSessions)
      .groupBy(voiceSessions.userId)
      .orderBy(sql`COUNT(*) DESC`)
      .limit(1)
      .get() as DBBadgeQueryCount | undefined;

      const topLizard = db.select({
        userId: voiceSessions.userId,
        shortCount: sql<number>`COUNT(*)`
      })
      .from(voiceSessions)
      .where(sql`${voiceSessions.durationSec} < 120`)
      .groupBy(voiceSessions.userId)
      .orderBy(sql`COUNT(*) DESC`)
      .limit(1)
      .get() as DBBadgeQueryShort | undefined;

      const topTryhard = db.select({
        userId: voiceSessions.userId,
        longCount: sql<number>`COUNT(*)`
      })
      .from(voiceSessions)
      .where(sql`${voiceSessions.durationSec} > 14400`)
      .groupBy(voiceSessions.userId)
      .orderBy(sql`COUNT(*) DESC`)
      .limit(1)
      .get() as DBBadgeQueryLong | undefined;

      const topWeekend = db.select({
        userId: voiceSessions.userId,
        weekendSec: sql<number>`SUM(${voiceSessions.durationSec})`
      })
      .from(voiceSessions)
      .where(sql`strftime('%w', ${voiceSessions.joinTime}) IN ('0', '6')`)
      .groupBy(voiceSessions.userId)
      .orderBy(sql`SUM(${voiceSessions.durationSec}) DESC`)
      .limit(1)
      .get() as DBBadgeQueryWeekend | undefined;

      const topJumper = db.select({
        userId: voiceSessions.userId,
        totalEvents: sql<number>`COUNT(*)`
      })
      .from(voiceSessions)
      .groupBy(voiceSessions.userId)
      .orderBy(sql`COUNT(*) DESC`)
      .limit(1)
      .get() as DBBadgeQueryEvents | undefined;

      const topHost = db.select({
        userId: voiceSessions.userId,
        hostSec: sql<number>`SUM(${voiceSessions.durationSec})`
      })
      .from(voiceSessions)
      .where(sql`${voiceSessions.durationSec} > 7200`)
      .groupBy(voiceSessions.userId)
      .orderBy(sql`SUM(${voiceSessions.durationSec}) DESC`)
      .limit(1)
      .get() as DBBadgeQueryHost | undefined;

      const embed = new EmbedBuilder()
        .setTitle("Rôles Virtuels & Trophées Actuels")
        .setColor("#FEE75C")
        .setDescription("Voici les champions actuels détenant les badges du serveur :")
        .addFields([
          { name: "Le Hibou Suprême (Activité de nuit, 00h-06h)", value: topNight ? `<@${topNight.userId}>\n${formatDurationDetailed(topNight.nightSec)}` : "Aucun" },
          { name: "Le Marathonien (Plus longue session d'affilée)", value: topMarathon ? `<@${topMarathon.userId}>\n${formatDurationDetailed(topMarathon.maxSec)}` : "Aucun" },
          { name: "Le Coq du Matin (Activité matinale, 06h-12h)", value: topMorning ? `<@${topMorning.userId}>\n${formatDurationDetailed(topMorning.morningSec)}` : "Aucun" },
          { name: "Le Caméléon (A exploré le plus de salons différents)", value: topCameleon ? `<@${topCameleon.userId}> avec \`${topCameleon.uniqueChans}\` salons visités.` : "Aucun" },
          { name: "Le Loup Solitaire (Plus grand nombre de sessions vocales)", value: topLone ? `<@${topLone.userId}> avec \`${topLone.sessionsCount}\` sessions.` : "Aucun" },
          { name: "Le Pilier de Comptoir (Plus de sessions de moins de 2 minutes)", value: topLizard ? `<@${topLizard.userId}> avec \`${topLizard.shortCount}\` apparitions éclairs.` : "Aucun" },
          { name: "Le Tryharder (Plus grand nombre de sessions > 4 heures)", value: topTryhard ? `<@${topTryhard.userId}> avec \`${topTryhard.longCount}\` sessions.` : "Aucun" },
          { name: "Le Guerrier du Weekend (Le plus actif le samedi/dimanche)", value: topWeekend ? `<@${topWeekend.userId}>\n${formatDurationDetailed(topWeekend.weekendSec)}` : "Aucun" },
          { name: "L'Instable (Le plus d'allers-retours)", value: topJumper ? `<@${topJumper.userId}> avec \`${topJumper.totalEvents}\` sauts de connexion.` : "Aucun" },
          { name: "Le Chaperon (Plus de temps dans des sessions de discussion de groupe)", value: topHost ? `<@${topHost.userId}>\n${formatDurationDetailed(topHost.hostSec)}` : "Aucun" }
        ])
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      logger.error("Erreur sur /badges", err);
      await interaction.editReply("Une erreur est survenue.");
    }
  }
};

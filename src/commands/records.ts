import { SlashCommandBuilder, EmbedBuilder, CommandInteraction } from "discord.js";
import db from "../../src/database/db";
import logger from "../../src/utils/logger";
import { formatDurationDetailed } from "../../src/utils/formatters";
import { voiceSessions } from "../../src/database/schema";
import { sql } from "drizzle-orm";

interface DBMaxSessionQuery {
  userId: string;
  durationSec: number;
  timestamp: string;
}

interface DBTopDayQuery {
  date: string;
  dailySec: number;
}

interface DBTopChanQuery {
  channelName: string;
  totalSec: number;
}

interface DBTopMonthQuery {
  month: string;
  totalSec: number;
}

interface DBWeekDayQuery {
  dayOfWeek: string;
  totalSec: number;
}

interface DBSeasonQuery {
  season: string;
  totalSec: number;
}

interface DBSessionRow {
  channelName: string;
  start: string;
  end: string;
}

export default {
  data: new SlashCommandBuilder()
    .setName("records")
    .setDescription("Affiche les records absolus du serveur en vocal"),
  async execute(interaction: CommandInteraction): Promise<void> {
    await interaction.deferReply();
    try {
      const maxSession = db.select({
        userId: voiceSessions.userId,
        durationSec: voiceSessions.durationSec,
        timestamp: voiceSessions.leaveTime
      })
      .from(voiceSessions)
      .orderBy(sql`${voiceSessions.durationSec} DESC`)
      .limit(1)
      .get() as DBMaxSessionQuery | undefined;

      const topDay = db.select({
        date: sql<string>`strftime('%Y-%m-%d', ${voiceSessions.joinTime})`,
        dailySec: sql<number>`SUM(${voiceSessions.durationSec})`
      })
      .from(voiceSessions)
      .groupBy(sql`strftime('%Y-%m-%d', ${voiceSessions.joinTime})`)
      .orderBy(sql`SUM(${voiceSessions.durationSec}) DESC`)
      .limit(1)
      .get() as DBTopDayQuery | undefined;

      const topChan = db.select({
        channelName: voiceSessions.channelName,
        totalSec: sql<number>`SUM(${voiceSessions.durationSec})`
      })
      .from(voiceSessions)
      .groupBy(voiceSessions.channelName)
      .orderBy(sql`SUM(${voiceSessions.durationSec}) DESC`)
      .limit(1)
      .get() as DBTopChanQuery | undefined;

      const topMonth = db.select({
        month: sql<string>`strftime('%Y-%m', ${voiceSessions.joinTime})`,
        totalSec: sql<number>`SUM(${voiceSessions.durationSec})`
      })
      .from(voiceSessions)
      .groupBy(sql`strftime('%Y-%m', ${voiceSessions.joinTime})`)
      .orderBy(sql`SUM(${voiceSessions.durationSec}) DESC`)
      .limit(1)
      .get() as DBTopMonthQuery | undefined;

      const minSession = db.select({
        userId: voiceSessions.userId,
        durationSec: voiceSessions.durationSec,
        timestamp: voiceSessions.leaveTime
      })
      .from(voiceSessions)
      .where(sql`${voiceSessions.durationSec} > 0`)
      .orderBy(sql`${voiceSessions.durationSec} ASC`)
      .limit(1)
      .get() as DBMaxSessionQuery | undefined;

      const weekDayQuery = db.select({
        dayOfWeek: sql<string>`
          CASE strftime('%w', ${voiceSessions.joinTime})
            WHEN '0' THEN 'Dimanche'
            WHEN '1' THEN 'Lundi'
            WHEN '2' THEN 'Mardi'
            WHEN '3' THEN 'Mercredi'
            WHEN '4' THEN 'Jeudi'
            WHEN '5' THEN 'Vendredi'
            ELSE 'Samedi'
          END
        `,
        totalSec: sql<number>`SUM(${voiceSessions.durationSec})`
      })
      .from(voiceSessions)
      .groupBy(sql`strftime('%w', ${voiceSessions.joinTime})`)
      .orderBy(sql`SUM(${voiceSessions.durationSec}) DESC`)
      .limit(1)
      .get() as DBWeekDayQuery | undefined;

      const seasonQuery = db.select({
        season: sql<string>`
          CASE
            WHEN strftime('%m', ${voiceSessions.joinTime}) IN ('03', '04', '05') THEN '🌸 Printemps'
            WHEN strftime('%m', ${voiceSessions.joinTime}) IN ('06', '07', '08') THEN '☀️ Été'
            WHEN strftime('%m', ${voiceSessions.joinTime}) IN ('09', '10', '11') THEN '🍂 Automne'
            ELSE '❄️ Hiver'
          END
        `,
        totalSec: sql<number>`SUM(${voiceSessions.durationSec})`
      })
      .from(voiceSessions)
      .groupBy(sql`
        CASE
          WHEN strftime('%m', ${voiceSessions.joinTime}) IN ('03', '04', '05') THEN 1
          WHEN strftime('%m', ${voiceSessions.joinTime}) IN ('06', '07', '08') THEN 2
          WHEN strftime('%m', ${voiceSessions.joinTime}) IN ('09', '10', '11') THEN 3
          ELSE 4
        END
      `)
      .orderBy(sql`SUM(${voiceSessions.durationSec}) DESC`)
      .limit(1)
      .get() as DBSeasonQuery | undefined;

      const allSessions = db.select({
        channelName: voiceSessions.channelName,
        start: sql<string>`strftime('%s', ${voiceSessions.joinTime})`,
        end: sql<string>`strftime('%s', ${voiceSessions.leaveTime})`
      })
      .from(voiceSessions)
      .orderBy(sql`${voiceSessions.joinTime} ASC`)
      .all() as DBSessionRow[];

      const chanIntervals: Record<string, { start: number; end: number }[]> = {};
      allSessions.forEach(s => {
        if (!chanIntervals[s.channelName]) {
          chanIntervals[s.channelName] = [];
        }
        chanIntervals[s.channelName].push({ start: parseInt(s.start), end: parseInt(s.end) });
      });

      let maxContinuousSec = 0;
      let maxContinuousChan = "Aucun";
      const MAX_GAP = 900;
      Object.entries(chanIntervals).forEach(([channel, intervals]) => {
        if (intervals.length === 0) {
          return;
        }
        intervals.sort((a, b) => a.start - b.start);
        let current = { start: intervals[0].start, end: intervals[0].end };
        for (let i = 1; i < intervals.length; i++) {
          const next = intervals[i];
          if (next.start <= current.end + MAX_GAP) {
            current.end = Math.max(current.end, next.end);
          } else {
            const diff = current.end - current.start;
            if (diff > maxContinuousSec) {
              maxContinuousSec = diff;
              maxContinuousChan = channel;
            }
            current = { start: next.start, end: next.end };
          }
        }
        const diff = current.end - current.start;
        if (diff > maxContinuousSec) {
          maxContinuousSec = diff;
          maxContinuousChan = channel;
        }
      });

      const embed = new EmbedBuilder()
        .setTitle("🥇 Hall of Fame - Records Vocaux")
        .setColor("#57F287")
        .addFields([
          { name: "⏱ Session individuelle la plus longue", value: maxSession ? `<@${maxSession.userId}> :\n${formatDurationDetailed(maxSession.durationSec)} (le ${new Date(maxSession.timestamp).toLocaleDateString("fr-FR")})` : "Aucun" },
          { name: "🔥 Activité continue record d'un salon (tous membres confondus)", value: `\`#${maxContinuousChan}\` :\n${formatDurationDetailed(maxContinuousSec)}` },
          { name: "📅 Journée historique la plus active", value: topDay ? `\`${new Date(topDay.date).toLocaleDateString("fr-FR")}\` avec un cumul de :\n${formatDurationDetailed(topDay.dailySec)}` : "Aucun" },
          { name: "🎙️ Le Salon Mythique (Salon le plus fréquenté)", value: topChan ? `\`#${topChan.channelName}\` avec un total de :\n${formatDurationDetailed(topChan.totalSec)}` : "Aucun" },
          { name: "🗓️ Le Mois d'Or", value: topMonth ? `\`${topMonth.month}\` avec un total de :\n${formatDurationDetailed(topMonth.totalSec)}` : "Aucun" },
          { name: "📈 Jour de la semaine le plus actif historiquement", value: weekDayQuery ? `\`${weekDayQuery.dayOfWeek}\` avec un cumul de :\n${formatDurationDetailed(weekDayQuery.totalSec)}` : "Aucun" },
          { name: "🍃 La Saison d'Or (Saison la plus active)", value: seasonQuery ? `${seasonQuery.season} avec un cumul de :\n${formatDurationDetailed(seasonQuery.totalSec)}` : "Aucun" },
          { name: "📉 La Session Éclair (Record du miss-click le plus rapide)", value: minSession ? `<@${minSession.userId}> avec une session de seulement \`${minSession.durationSec}s\` (le ${new Date(minSession.timestamp).toLocaleDateString("fr-FR")})` : "Aucun" }
        ])
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      logger.error("Erreur sur /records", err);
      await interaction.editReply("Une erreur est survenue.");
    }
  }
};

import db from "../database/db";
import logger from "../utils/logger";
import config from "../config";
import { EmbedBuilder, Client, TextChannel } from "discord.js";
import { formatDurationDetailed } from "../utils/formatters";
import { voiceSessions, leaderboardSnapshots, state } from "../database/schema";
import { sql, eq, desc } from "drizzle-orm";

interface DBLeaderboardRow {
  userId: string;
  userName: string;
  totalSec: number;
}

interface DBSnapshotRow {
  userId: string;
  rank: number;
}

export function startCronTasks(client: Client): void {
  logger.info("Planificateur de tâches démarré (Bilan + Snapshots).");

  setInterval(async () => {
    try {
      const now = new Date();

      const parisHour = parseInt(now.toLocaleTimeString("fr-FR", { timeZone: config.timezone, hour: "2-digit", hour12: false }));
      const parisDateStr = now.toLocaleDateString("fr-CA", { timeZone: config.timezone });
      const parisDay = parseInt(now.toLocaleDateString("fr-FR", { timeZone: config.timezone, day: "numeric" }));
      const parisDayOfWeek = now.toLocaleDateString("fr-FR", { timeZone: config.timezone, weekday: "short" });

      if (parisDay === 1 && parisHour === 12) {
        const key = `monthly_report_${now.getFullYear()}_${now.getMonth() + 1}`;
        const alreadySent = db.select().from(state).where(eq(state.key, key)).get();
        if (!alreadySent) {
          db.insert(state).values({ key, value: "sent" }).run();
          await sendMonthlyReport(client);
        }
      }

      if (parisDayOfWeek === "lun" && parisHour === 4) {
        const weekKey = `weekly_snapshot_${parisDateStr}`;
        const alreadySnapped = db.select().from(state).where(eq(state.key, weekKey)).get();
        if (!alreadySnapped) {
          db.insert(state).values({ key: weekKey, value: "sent" }).run();
          takeSnapshot(parisDateStr, "weekly");
        }
      }

      if (parisDay === 1 && parisHour === 4) {
        const monthKey = `monthly_snapshot_${parisDateStr}`;
        const alreadySnapped = db.select().from(state).where(eq(state.key, monthKey)).get();
        if (!alreadySnapped) {
          db.insert(state).values({ key: monthKey, value: "sent" }).run();
          takeSnapshot(parisDateStr, "monthly");
        }
      }

    } catch (err) {
      logger.error("Erreur critique dans le planificateur de tâches", err);
    }
  }, 60000);
}

function takeSnapshot(dateStr: string, periodType: "weekly" | "monthly"): void {
  try {
    const leaderboard = db.select({
      userId: voiceSessions.userId,
      userName: voiceSessions.userName,
      totalSec: sql<number>`SUM(${voiceSessions.durationSec})`
    })
    .from(voiceSessions)
    .groupBy(voiceSessions.userId)
    .orderBy(sql`SUM(${voiceSessions.durationSec}) DESC`)
    .all() as DBLeaderboardRow[];

    db.transaction(() => {
      leaderboard.forEach((user, index) => {
        db.insert(leaderboardSnapshots).values({
          snapshotDate: dateStr,
          periodType,
          userId: user.userId,
          userName: user.userName,
          rank: index + 1,
          totalTime: user.totalSec
        }).run();
      });
    });

    logger.info(`Snapshot ${periodType} enregistré avec succès pour la date : ${dateStr}`);
  } catch (err) {
    logger.error("Erreur lors de la capture de snapshot", err);
  }
}

async function sendMonthlyReport(client: Client): Promise<void> {
  if (!config.statsChannelId) {
    return;
  }
  const channel = await client.channels.fetch(config.statsChannelId).catch(() => null) as TextChannel | null;
  if (!channel) {
    return;
  }

  const now = new Date();
  const lastMonthNum = now.getMonth() === 0 ? 12 : now.getMonth();
  const yearOfLastMonth = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const lastMonthString = `${yearOfLastMonth}-${String(lastMonthNum).padStart(2, "0")}`;

  const monthlyTop = db.select({
    userId: voiceSessions.userId,
    userName: voiceSessions.userName,
    totalSec: sql<number>`SUM(${voiceSessions.durationSec})`
  })
  .from(voiceSessions)
  .where(sql`strftime('%Y-%m', ${voiceSessions.joinTime}) = ${lastMonthString}`)
  .groupBy(voiceSessions.userId)
  .orderBy(sql`SUM(${voiceSessions.durationSec}) DESC`)
  .limit(5)
  .all() as DBLeaderboardRow[];

  if (monthlyTop.length === 0) {
    return;
  }

  const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
  
  const oldSnapshot = db.select({
    userId: leaderboardSnapshots.userId,
    rank: leaderboardSnapshots.rank
  })
  .from(leaderboardSnapshots)
  .where(eq(leaderboardSnapshots.periodType, "monthly"))
  .orderBy(desc(leaderboardSnapshots.id))
  .all() as DBSnapshotRow[];

  const embed = new EmbedBuilder()
    .setTitle(`📊 GAZETTE VOCALE - BILAN DE ${monthNames[lastMonthNum - 1].toUpperCase()} ${yearOfLastMonth}`)
    .setColor("#EB459E")
    .setDescription("Le mois s'est achevé ! Voici les plus grands bavards de notre communauté le mois dernier :")
    .setTimestamp();

  let podiumText = "";
  const medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"];

  monthlyTop.forEach((row, idx) => {
    let trend = "";
    if (oldSnapshot.length > 0) {
      const match = oldSnapshot.find(snap => snap.userId === row.userId);
      if (match) {
        const diff = match.rank - (idx + 1);
        if (diff > 0) {
          trend = ` 📈 (+${diff} place${diff > 1 ? "s" : ""})`;
        } else if (diff < 0) {
          trend = ` 📉 (${diff} place${Math.abs(diff) > 1 ? "s" : ""})`;
        } else {
          trend = " ➡️ (stable)";
        }
      } else {
        trend = " 🆕 (Nouvelle entrée)";
      }
    }

    podiumText += `${medals[idx]} <@${row.userId}> avec :${trend}\n${formatDurationDetailed(row.totalSec)}\n\n`;
  });

  embed.addFields([{ name: "Top 5 du mois écoulé", value: podiumText }]);
  await channel.send({ embeds: [embed] }).catch(() => null);
}

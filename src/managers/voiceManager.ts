import db from "../database/db";
import logger from "../utils/logger";
import { checkAndAnnounceRecord } from "./recordManager";
import config from "../config";
import { Client, EmbedBuilder, TextChannel } from "discord.js";
import { voiceSessions, voiceDeafSessions } from "../database/schema";
import { sql, eq, and, lte, gte } from "drizzle-orm";

interface DBLeaderboardRow {
  userId: string;
  userName: string;
  totalSec: number;
}

function getFullLeaderboard(): DBLeaderboardRow[] {
  return db.select({
    userId: voiceSessions.userId,
    userName: voiceSessions.userName,
    totalSec: sql<number>`SUM(${voiceSessions.durationSec})`
  })
  .from(voiceSessions)
  .groupBy(voiceSessions.userId)
  .orderBy(sql`SUM(${voiceSessions.durationSec}) DESC`)
  .all() as DBLeaderboardRow[];
}

export async function checkRankOvertake(client: Client, userId: string, username: string, sessionSec: number): Promise<void> {
  if (!config.statsChannelId) {
    return;
  }

  try {
    const channel = await client.channels.fetch(config.statsChannelId).catch(() => null) as TextChannel | null;
    if (!channel) {
      return;
    }

    const leaderboard = getFullLeaderboard();
    const myRankIdx = leaderboard.findIndex(u => u.userId === userId);
    
    if (myRankIdx === -1 || myRankIdx === 0) {
      return;
    }

    const myCurrentTotal = leaderboard[myRankIdx].totalSec;
    const myProjectedTotal = myCurrentTotal + sessionSec;

    for (let i = myRankIdx - 1; i >= 0; i--) {
      const targetUser = leaderboard[i];
      if (myProjectedTotal > targetUser.totalSec && myCurrentTotal <= targetUser.totalSec) {
        const embed = new EmbedBuilder()
          .setTitle("⚡ DÉPASSEMENT DE CLASSEMENT EN DIRECT !")
          .setColor("#3498DB")
          .setDescription(`🔥 Avec sa session vocale en cours, <@${username}> vient de dépasser <@${targetUser.userId}> et s'empare virtuellement du **Rang #${i + 1}** !`)
          .setTimestamp();
        
        await channel.send({ embeds: [embed] }).catch(() => null);
        break;
      }
    }
  } catch (err) {
    logger.error("Erreur lors de la vérification du dépassement de classement", err);
  }
}

export function recordCompletedSession(client: Client, userId: string, username: string, channelName: string, joinTimeStr: string, leaveTimeStr: string): void {
  try {
    const joinTime = new Date(joinTimeStr);
    const leaveTime = new Date(leaveTimeStr);
    const durationSec = Math.floor((leaveTime.getTime() - joinTime.getTime()) / 1000);
    
    if (durationSec <= 0) {
      return;
    }

    const deafQuery = db.select({
      totalDeaf: sql<number>`SUM(${voiceDeafSessions.durationSec})`
    })
    .from(voiceDeafSessions)
    .where(
      and(
        eq(voiceDeafSessions.userId, userId),
        gte(voiceDeafSessions.startTime, joinTimeStr),
        lte(voiceDeafSessions.endTime, leaveTimeStr)
      )
    )
    .get() as { totalDeaf: number | null } | undefined;
    
    const deafSec = deafQuery?.totalDeaf || 0;
    const activeSec = Math.max(0, durationSec - deafSec);

    db.insert(voiceSessions).values({
      userId,
      userName: username,
      channelName,
      joinTime: joinTimeStr,
      leaveTime: leaveTimeStr,
      durationSec,
      activeSec,
      deafSec
    }).run();

    logger.info(`[STATS] Session enregistrée pour ${username} (${channelName}) : ${durationSec}s (Actif: ${activeSec}s, Sourdine: ${deafSec}s)`);
    
    db.delete(voiceDeafSessions)
      .where(and(eq(voiceDeafSessions.userId, userId), lte(voiceDeafSessions.endTime, leaveTimeStr)))
      .run();

    checkAndAnnounceRecord(client, userId, username, durationSec);

  } catch (err) {
    logger.error(`Erreur lors de l'enregistrement de la session pour ${username}`, err);
  }
}

export function recordDeafSession(userId: string, username: string, channelName: string, startTimeStr: string, endTimeStr: string): void {
  try {
    const start = new Date(startTimeStr);
    const end = new Date(endTimeStr);
    const durationSec = Math.floor((end.getTime() - start.getTime()) / 1000);
    
    if (durationSec <= 0) {
      return;
    }

    db.insert(voiceDeafSessions).values({
      userId,
      userName: username,
      channelName,
      startTime: startTimeStr,
      endTime: endTimeStr,
      durationSec
    }).run();

    logger.info(`[DEAF] Sourdine casque enregistrée pour ${username} : ${durationSec}s`);
  } catch (err) {
    logger.error(`Erreur lors de l'enregistrement de sourdine pour ${username}`, err);
  }
}

import db from "../database/db";
import config from "../config";
import { EmbedBuilder, Client, TextChannel } from "discord.js";
import { formatDurationDetailed } from "../utils/formatters";
import { voiceSessions, state } from "../database/schema";
import { sql, eq } from "drizzle-orm";

interface DBLeaderboardRow {
  userId: string;
  totalSec: number;
}

export function getRevealedRanksCount(): number {
  const isFinalDone = db.select().from(state).where(eq(state.key, "reveal_announced_final")).get();
  if (isFinalDone) {
    return 10;
  }

  const now = new Date();
  if (now < config.revealStartDate) {
    return 0;
  }
  const diffTime = Math.abs(now.getTime() - config.revealStartDate.getTime());
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const currentDay = diffDays + 1;
  if (currentDay >= 9) {
    return 10;
  }
  return currentDay;
}

export function isUserRevealed(targetUserId: string): boolean {
  const query = db.select({
    rank: sql<number>`rank`
  })
  .from(
    sql`(
      SELECT user_id, ROW_NUMBER() OVER (ORDER BY SUM(duration_sec) DESC) as rank
      FROM voice_sessions
      GROUP BY user_id
    )`
  )
  .where(sql`user_id = ${targetUserId}`)
  .get() as { rank: number } | undefined;

  if (!query) {
    return true;
  }
  const rank = query.rank;
  if (rank <= 10) {
    const revealedCount = getRevealedRanksCount();
    const rankToReveal = 11 - rank;
    return revealedCount >= rankToReveal;
  }
  return true;
}

export async function triggerRevealAnnonceByRank(client: Client, rankToReveal: number): Promise<boolean> {
  if (!config.statsChannelId) {
    return false;
  }
  const channel = await client.channels.fetch(config.statsChannelId).catch(() => null) as TextChannel | null;
  if (!channel) {
    return false;
  }

  const leaderboard = db.select({
    userId: voiceSessions.userId,
    totalSec: sql<number>`SUM(${voiceSessions.durationSec})`
  })
  .from(voiceSessions)
  .groupBy(voiceSessions.userId)
  .orderBy(sql`SUM(${voiceSessions.durationSec}) DESC`)
  .all() as DBLeaderboardRow[];

  if (rankToReveal <= 2) {
    const p2 = leaderboard[1];
    const p1 = leaderboard[0];
    if (!p2 || !p1) {
      return false;
    }

    const embed = new EmbedBuilder()
      .setTitle("✨ LE GRAND REVEAL FINAL EST ARRIVÉ !")
      .setColor("#EB459E")
      .setDescription(`🔥 Le suspense prend fin aujourd'hui avec le dévoilement simultané des deux premières places de notre serveur !\n\n` +
                      `🥈 **Rang #2 :** <@${p2.userId}> avec :\n${formatDurationDetailed(p2.totalSec)}\n\n` +
                      `👑 **Rang #1 :** <@${p1.totalSec}> avec un score légendaire de :\n${formatDurationDetailed(p1.totalSec)}\n\n` +
                      `Félicitations à tous les membres pour cette incroyable activité ! Le classement complet est maintenant visible sans aucun masque avec la commande \`/top\`.`)
      .setTimestamp();

    await channel.send({ embeds: [embed] }).catch(() => null);
  } else {
    const targetRow = leaderboard[rankToReveal - 1];
    if (!targetRow) {
      return false;
    }

    const embed = new EmbedBuilder()
      .setTitle("🔒 NOUVEAU DÉVOILEMENT DANS LE CLASSEMENT !")
      .setColor("#5865F2")
      .setDescription(`🎉 La position **#${rankToReveal}** du Top 10 vient d'être révélée !\n\n` +
                      `Félicitations à <@${targetRow.userId}> qui s'empare de ce rang avec :\n${formatDurationDetailed(targetRow.totalSec)}\n\n` +
                      `Utilise la commande \`/top\` pour voir l'évolution du classement en direct !`)
      .setTimestamp();

    await channel.send({ embeds: [embed] }).catch(() => null);
  }
  return true;
}

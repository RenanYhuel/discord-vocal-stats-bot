import db from "../database/db";
import logger from "../utils/logger";
import config from "../config";
import { Client, EmbedBuilder, TextChannel } from "discord.js";
import { formatDurationStandard, formatDurationDetailed } from "../utils/formatters";
import { voiceSessions } from "../database/schema";
import { sql, eq, and, lt } from "drizzle-orm";

export async function checkAndAnnounceRecord(client: Client, userId: string, username: string, durationSec: number): Promise<void> {
  if (!config.statsChannelId) {
    return;
  }

  try {
    const channel = await client.channels.fetch(config.statsChannelId).catch(() => null) as TextChannel | null;
    if (!channel) {
      return;
    }

    // Recherche du max serveur basé sur le temps actif réel (activeSec)
    const serverMaxQuery = db.select({
      maxSec: sql<number>`MAX(${voiceSessions.activeSec})`
    })
    .from(voiceSessions)
    .where(sql`${voiceSessions.userId} != ${userId}`)
    .get() as { maxSec: number | null } | undefined;
    
    const serverMax = serverMaxQuery?.maxSec || 0;

    if (durationSec > serverMax && serverMax > 0) {
      const embed = new EmbedBuilder()
        .setTitle("👑 NOUVEAU RECORD HISTORIQUE DU SERVEUR !")
        .setColor("#FEE75C")
        .setDescription(`🎉 Incroyable ! <@${userId}> vient d'exploser le record de la plus longue session d'affilée en vocal sur le serveur !\n\n**Ancienne marque à battre :** \`${formatDurationStandard(serverMax)}\`\n**Nouveau record absolu :**\n${formatDurationDetailed(durationSec)}`)
        .setTimestamp();
      await channel.send({ embeds: [embed] }).catch(() => null);
      return;
    }

    // Recherche du max personnel basé sur le temps actif réel (activeSec)
    const personalMaxQuery = db.select({
      maxSec: sql<number>`MAX(${voiceSessions.activeSec})`
    })
    .from(voiceSessions)
    .where(
      and(
        eq(voiceSessions.userId, userId),
        lt(voiceSessions.activeSec, durationSec)
      )
    )
    .get() as { maxSec: number | null } | undefined;
    
    const personalMax = personalMaxQuery?.maxSec || 0;

    if (durationSec > personalMax && personalMax > 0) {
      const embed = new EmbedBuilder()
        .setTitle("🔥 NOUVEAU RECORD PERSONNEL !")
        .setColor("#57F287")
        .setDescription(`Félicitations à <@${username}> qui vient de battre son propre record de temps passé en vocal en une seule session !\n\n**Ancien record :** \`${formatDurationStandard(personalMax)}\`\n**Nouveau record personnel :** \`${formatDurationStandard(durationSec)}\``)
        .setTimestamp();
      await channel.send({ embeds: [embed] }).catch(() => null);
      return;
    }
  } catch (err) {
    logger.error("Erreur lors de la vérification/annonce de record", err);
  }
}

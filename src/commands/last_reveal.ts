import { SlashCommandBuilder, EmbedBuilder, CommandInteraction, TextChannel } from "discord.js";
import config from "../../src/config";
import db from "../../src/database/db";
import { formatDurationDetailed } from "../../src/utils/formatters";
import { voiceSessions, state } from "../../src/database/schema";
import { sql } from "drizzle-orm";

interface DBLeaderboardRow {
  userId: string;
  totalSec: number;
}

export default {
  data: new SlashCommandBuilder()
    .setName("last_reveal")
    .setDescription("🔴 [ADMIN] Déclenche le double reveal final en direct avec suspense"),
  async execute(interaction: CommandInteraction): Promise<void> {
    if (interaction.user.id !== config.adminId) {
      await interaction.reply({ content: "🔒 Action réservée à l'administrateur.", ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const statsChannel = await interaction.client.channels.fetch(config.statsChannelId).catch(() => null) as TextChannel | null;
    if (!statsChannel) {
      await interaction.editReply("❌ Impossible de trouver le salon d'annonces.");
      return;
    }

    const leaderboard = db.select({
      userId: voiceSessions.userId,
      totalSec: sql<number>`SUM(${voiceSessions.durationSec})`
    })
    .from(voiceSessions)
    .groupBy(voiceSessions.userId)
    .orderBy(sql`SUM(${voiceSessions.durationSec}) DESC`)
    .all() as DBLeaderboardRow[];

    const p2 = leaderboard[1];
    const p1 = leaderboard[0];

    if (!p2 || !p1) {
      await interaction.editReply("❌ Données insuffisantes pour le Top 2.");
      return;
    }

    const introEmbed = new EmbedBuilder()
      .setTitle("✨ LE GRAND REVEAL FINAL : TOP 2 !")
      .setColor("#E74C3C")
      .setDescription("🔥 Installez-vous confortablement... C'est l'heure de lever le voile sur le podium ultime de notre serveur !\n\n*Révélation de la 2ème place dans un instant...*")
      .setTimestamp();

    const introMsg = await statsChannel.send({ embeds: [introEmbed] });

    await new Promise(resolve => setTimeout(resolve, 8000));

    const p2Embed = new EmbedBuilder()
      .setTitle("🥈 DEUXIÈME PLACE DU CLASSEMENT GENERAL !")
      .setColor("#95A5A6")
      .setDescription(`Félicitations à <@${p2.userId}> qui s'empare de la deuxième place avec un temps colossal de :\n\n${formatDurationDetailed(p2.totalSec)}\n\n*Qui est le numéro 1 ? Roulement de tambour...*`)
      .setTimestamp();

    await introMsg.edit({ embeds: [p2Embed] });

    await new Promise(resolve => setTimeout(resolve, 6000));

    const drumMsg = await statsChannel.send({ content: "🥁 *Roulement de tambour...* (Révélation dans 5 secondes)" });

    for (let i = 4; i > 0; i--) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      await drumMsg.edit({ content: `🥁 *Roulement de tambour...* (Révélation dans ${i} seconde${i > 1 ? "s" : ""})` });
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    await drumMsg.delete().catch(() => null);

    const p1Embed = new EmbedBuilder()
      .setTitle("👑 PREMIÈRE PLACE - LE GRAND CHAMPION !")
      .setColor("#F1C40F")
      .setDescription(`🎉 Absolument légendaire ! <@${p1.userId}> est couronné grand vainqueur avec un score historique de :\n\n${formatDurationDetailed(p1.totalSec)}\n\nUn immense bravo à lui et à tous les participants ! Le classement complet est désormais disponible via \`/top\`.`)
      .setTimestamp();

    await statsChannel.send({ embeds: [p1Embed] });

    db.insert(state).values({ key: "reveal_announced_final", value: "true" }).onConflictDoUpdate({
      target: state.key,
      set: { value: "true" }
    }).run();

    await interaction.editReply("✅ Double reveal final lancé avec succès !");
  }
};

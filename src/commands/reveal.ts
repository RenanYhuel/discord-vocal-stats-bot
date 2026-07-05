import { SlashCommandBuilder, EmbedBuilder, CommandInteraction } from "discord.js";
import { getRevealedRanksCount } from "../../src/managers/revealManager";
import config from "../../src/config";

export default {
  data: new SlashCommandBuilder()
    .setName("reveal")
    .setDescription("Affiche le statut et le compte à rebours du reveal du Top 10"),
  async execute(interaction: CommandInteraction): Promise<void> {
    const revealed = getRevealedRanksCount();
    const now = new Date();
    
    let countdownText = "";
    if (revealed >= 10) {
      countdownText = "🎉 **Le reveal est entièrement terminé ! Tout le classement est visible.**";
    } else {
      const nextRevealIndex = revealed + 1;
      const nextRankToReveal = 11 - nextRevealIndex;
      
      const nextDate = new Date(config.revealStartDate.getTime() + revealed * 24 * 60 * 60 * 1000);
      const diffMs = nextDate.getTime() - now.getTime();
      
      if (diffMs > 0) {
        const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
        const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        countdownText = `⏳ **Prochain dévoilement (Rang #${nextRankToReveal}) :** dans \`${diffHrs}h ${diffMins}m\` (le ${nextDate.toLocaleDateString("fr-FR")} à 16:00)`;
      } else {
        countdownText = `⏳ **Le dévoilement du Rang #${nextRankToReveal} est imminent !**`;
      }
    }

    const embed = new EmbedBuilder()
      .setTitle("🔒 Statut du Reveal - Top 10")
      .setColor("#9B59B6")
      .setDescription(`Nombre de places révélées actuellement : **${revealed} / 10**\n\n${countdownText}`)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
};

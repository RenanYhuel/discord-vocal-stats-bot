import logger from "../utils/logger";
import db from "../database/db";
import { getRevealedRanksCount } from "../managers/revealManager";
import { generateLeaderboardEmbed, generateLeaderboardButtons } from "../commands/top";
import { CommandInteraction, ButtonInteraction, Client } from "discord.js";
import { voiceSessions } from "../database/schema";
import { sql } from "drizzle-orm";

interface DBLeaderboardRow {
  userId: string;
  userName: string;
  totalSec: number;
}

export default {
  name: "interactionCreate",
  async execute(interaction: CommandInteraction | ButtonInteraction, client: Client): Promise<void> {
    if (interaction.isButton()) {
      const customId = interaction.customId;

      if (customId.startsWith("page_")) {
        const [_, pageStr] = customId.split("_");
        await interaction.deferUpdate();
        const page = parseInt(pageStr);

        const leaderboard = db.select({
          userId: voiceSessions.userId,
          userName: voiceSessions.userName,
          totalSec: sql<number>`SUM(${voiceSessions.durationSec})`
        })
        .from(voiceSessions)
        .groupBy(voiceSessions.userId)
        .orderBy(sql`SUM(${voiceSessions.durationSec}) DESC`)
        .all() as DBLeaderboardRow[];

        const revealedRanks = getRevealedRanksCount();
        const totalPages = Math.ceil(leaderboard.length / 10);

        const embed = generateLeaderboardEmbed(leaderboard, page, totalPages, revealedRanks);
        const row = generateLeaderboardButtons(page, totalPages);

        await interaction.editReply({ embeds: [embed], components: [row] }).catch(() => null);
        return;
      }
    }

    if (!interaction.isChatInputCommand()) {
      return;
    }

    const command = (client as any).commands.get(interaction.commandName);
    if (!command) {
      return;
    }

    try {
      logger.info(`[COMMAND] Executing command: /${interaction.commandName} by ${interaction.user.tag}`);
      await command.execute(interaction, client);
    } catch (error) {
      logger.error(`Erreur d'exécution de la commande /${interaction.commandName}`, error);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: "Une erreur est survenue lors de l'exécution de cette commande.", ephemeral: true }).catch(() => null);
      } else {
        await interaction.reply({ content: "Une erreur est survenue lors de l'exécution de cette commande.", ephemeral: true }).catch(() => null);
      }
    }
  }
};

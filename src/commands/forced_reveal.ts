import { 
  SlashCommandBuilder, 
  StringSelectMenuBuilder, 
  StringSelectMenuOptionBuilder, 
  ActionRowBuilder,
  CommandInteraction
} from "discord.js";
import config from "../../src/config";

export default {
  data: new SlashCommandBuilder()
    .setName("forced_reveal")
    .setDescription("🔴 [ADMIN] Force la publication immédiate du reveal d'un rang choisi"),
  async execute(interaction: CommandInteraction): Promise<void> {
    if (interaction.user.id !== config.adminId) {
      await interaction.reply({ content: "🔒 **Commande réservée à l'administrateur du bot.**", ephemeral: true });
      return;
    }

    const select = new StringSelectMenuBuilder()
      .setCustomId("admin_select_reveal")
      .setPlaceholder("Choisir le rang à dévoiler...")
      .addOptions(
        new StringSelectMenuOptionBuilder().setLabel("Rang #10").setValue("10"),
        new StringSelectMenuOptionBuilder().setLabel("Rang #9").setValue("9"),
        new StringSelectMenuOptionBuilder().setLabel("Rang #8").setValue("8"),
        new StringSelectMenuOptionBuilder().setLabel("Rang #7").setValue("7"),
        new StringSelectMenuOptionBuilder().setLabel("Rang #6").setValue("6"),
        new StringSelectMenuOptionBuilder().setLabel("Rang #5").setValue("5"),
        new StringSelectMenuOptionBuilder().setLabel("Rang #4").setValue("4"),
        new StringSelectMenuOptionBuilder().setLabel("Rang #3").setValue("3"),
        new StringSelectMenuOptionBuilder().setLabel("Rangs #2 & #1 (Grand Final)").setValue("2")
      );

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);

    await interaction.reply({
      content: "🛠️ **Panneau d'Administration - Force Reveal**\nSélectionne dans la liste ci-dessous le rang exact que tu veux publier immédiatement dans le salon d'annonces :",
      components: [row],
      ephemeral: true
    });
  }
};

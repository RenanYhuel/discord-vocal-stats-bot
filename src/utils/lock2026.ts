import { EmbedBuilder } from "discord.js";

export function get2026LockedEmbed(): EmbedBuilder | null {
    const now = new Date();
    const unlockDate = new Date("2026-12-01T00:00:00Z");

    if (now.getTime() < unlockDate.getTime()) {
        const diffMs = unlockDate.getTime() - now.getTime();
        const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

        return new EmbedBuilder()
            .setTitle("Données 2026 - Bientôt disponible")
            .setColor("#E67E22")
            .setDescription(
                `L'année 2026 n'est pas encore terminée !\n\n` +
                `Toutes les statistiques, bilans, classements et Wrapped de l'année **2026** seront déverrouillés le **1er décembre 2026** (dans environ **${daysRemaining} jours**).\n\n` +
                `En attendant, tu peux explorer les classements et ton Wrapped de **2025** !`
            )
            .setFooter({ text: "StatsBot • Patience..." })
            .setTimestamp();
    }

    return null;
}

import { EmbedBuilder } from "discord.js";

export function getFirstSaturdayOfDecember(year: number): Date {
    const d = new Date(Date.UTC(year, 11, 1, 9, 0, 0));
    while (d.getUTCDay() !== 6) {
        d.setUTCDate(d.getUTCDate() + 1);
    }
    return d;
}

export function getYearLockedEmbed(year?: number): EmbedBuilder | null {
    const now = new Date();
    const targetYear = year || now.getFullYear();

    if (targetYear < now.getFullYear()) {
        return null;
    }

    const unlockDate = getFirstSaturdayOfDecember(targetYear);

    if (now.getTime() < unlockDate.getTime()) {
        const diffMs = unlockDate.getTime() - now.getTime();
        const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        const dayOfMonth = unlockDate.getUTCDate();

        return new EmbedBuilder()
            .setTitle(`Données ${targetYear} - Bientôt disponible`)
            .setColor("#E67E22")
            .setDescription(
                `L'année ${targetYear} n'est pas encore terminée !\n\n` +
                    `Toutes les statistiques, bilans, classements et Wrapped de l'année **${targetYear}** seront déverrouillés le **samedi ${dayOfMonth} décembre ${targetYear} à 10h00** (dans environ **${daysRemaining} jours**).\n\n` +
                    `En attendant, tu peux explorer les classements et ton Wrapped de **${targetYear - 1}** !`,
            )
            .setFooter({ text: "DVSB • Patience..." })
            .setTimestamp();
    }

    return null;
}

export function get2026LockedEmbed(): EmbedBuilder | null {
    return getYearLockedEmbed(2026);
}

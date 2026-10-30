import {
    SlashCommandBuilder,
    EmbedBuilder,
    ChatInputCommandInteraction,
    GuildMember,
} from "discord.js";
import config from "../config";
import logger from "../utils/logger";
import { parseFlexibleDate } from "../utils/dateParser";
import { checkAiQuota, consumeAiQuota } from "../managers/aiQuotaManager";
import { fetchChannelMessages } from "../services/messageFetcher";
import {
    summarizeTranscript,
    ResumeStyle,
    RESUME_STYLE_NAMES,
} from "../services/geminiService";

export default {
    data: new SlashCommandBuilder()
        .setName("resume")
        .setDescription(
            "Génère un résumé intelligent de la discussion avec filtres et styles variés",
        )
        .addIntegerOption((option) =>
            option
                .setName("messages")
                .setDescription(
                    "Nombre de messages récents à analyser (10 à 500)",
                )
                .setMinValue(10)
                .setMaxValue(500),
        )
        .addNumberOption((option) =>
            option
                .setName("depuis_heures")
                .setDescription(
                    "Analyser les messages des X dernières heures (ex: 2 ou 0.5)",
                )
                .setMinValue(0.1)
                .setMaxValue(720),
        )
        .addStringOption((option) =>
            option
                .setName("depuis_date")
                .setDescription(
                    "Heure ou date de départ (ex: 14:30, hier 20:00, 30/10/2026)",
                ),
        )
        .addStringOption((option) =>
            option
                .setName("depuis_message")
                .setDescription("ID ou lien du message Discord de départ"),
        )
        .addUserOption((option) =>
            option
                .setName("membre")
                .setDescription(
                    "Filtrer uniquement sur les messages d'un membre",
                ),
        )
        .addStringOption((option) =>
            option
                .setName("sujet")
                .setDescription(
                    "Focaliser le résumé sur un sujet ou mot-clé précis",
                ),
        )
        .addStringOption((option) =>
            option
                .setName("style")
                .setDescription(
                    "Style rédactionnel du résumé (défaut : Synthèse)",
                )
                .addChoices(
                    {
                        name: "Synthèse (équilibrée et structurée)",
                        value: "synthese",
                    },
                    { name: "TL;DR (court en 3-4 puces)", value: "tldr" },
                    {
                        name: "Drama et potins (ton téléréalité)",
                        value: "drama",
                    },
                    {
                        name: "Roast (humoristique et sarcastique)",
                        value: "roast",
                    },
                    {
                        name: "Analyse de débat (arguments et positions)",
                        value: "debat",
                    },
                    {
                        name: "Chronologique (déroulement temporel)",
                        value: "chronologique",
                    },
                    {
                        name: "Procès-verbal (style officiel et corporate)",
                        value: "officiel",
                    },
                ),
        )
        .addBooleanOption((option) =>
            option
                .setName("inclure_bots")
                .setDescription(
                    "Inclure les messages envoyés par les bots (faux par défaut)",
                ),
        ),

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        await interaction.deferReply();

        if (!interaction.channel || !interaction.channel.isTextBased()) {
            await interaction.editReply({
                content:
                    "Cette commande ne peut être exécutée que dans un salon textuel.",
            });
            return;
        }

        if (!config.geminiApiKey) {
            await interaction.editReply({
                content:
                    "La fonctionnalité de résumé IA est indisponible (clé GEMINI_API_KEY non configurée).",
            });
            return;
        }

        const member = interaction.member as GuildMember | null;
        const roleIds =
            member &&
            "roles" in member &&
            member.roles &&
            "cache" in member.roles
                ? Array.from(member.roles.cache.keys())
                : [];

        const quota = checkAiQuota(interaction.user.id, roleIds);
        if (!quota.allowed) {
            const quotaEmbed = new EmbedBuilder()
                .setTitle("Quota quotidien atteint")
                .setColor(0xed4245)
                .setDescription(
                    `Tu as atteint ta limite de ${quota.total} résumés IA pour aujourd'hui.\n\nTes crédits se réinitialiseront automatiquement demain à 00:00.`,
                )
                .setFooter({ text: "Système de quotas IA" });

            await interaction.editReply({ embeds: [quotaEmbed] });
            return;
        }

        const messagesCount =
            interaction.options.getInteger("messages") || undefined;
        const depuisHeures =
            interaction.options.getNumber("depuis_heures") || undefined;
        const depuisDateRaw = interaction.options.getString("depuis_date");
        const depuisMessage =
            interaction.options.getString("depuis_message") || undefined;
        const targetMember = interaction.options.getUser("membre");
        const topicQuery = interaction.options.getString("sujet") || undefined;
        const chosenStyle =
            (interaction.options.getString("style") as ResumeStyle) ||
            "synthese";
        const includeBots =
            interaction.options.getBoolean("inclure_bots") ?? false;

        let parsedDate: Date | undefined = undefined;
        if (depuisDateRaw) {
            const parsed = parseFlexibleDate(depuisDateRaw);
            if (!parsed) {
                await interaction.editReply({
                    content:
                        "Format temporel non reconnu pour `depuis_date`. Exemples acceptés : `14:30`, `hier 20:00`, `30/10/2026`, `2h`, `30m`.",
                });
                return;
            }
            parsedDate = parsed;
        }

        let fetchResult;
        try {
            fetchResult = await fetchChannelMessages(interaction.channel, {
                limitCount: messagesCount,
                sinceHours: depuisHeures,
                sinceDate: parsedDate,
                sinceMessageId: depuisMessage,
                memberId: targetMember?.id,
                topic: topicQuery,
                includeBots,
            });
        } catch (error) {
            logger.error(
                "Erreur lors de la récupération des messages Discord :",
                error,
            );
            await interaction.editReply({
                content:
                    "Une erreur est survenue lors de la récupération des messages du salon.",
            });
            return;
        }

        if (fetchResult.messageCount === 0) {
            await interaction.editReply({
                content:
                    "Aucun message ne correspond aux critères de sélection indiqués.",
            });
            return;
        }

        let summaryText: string;
        try {
            summaryText = await summarizeTranscript(
                fetchResult.formattedTranscript,
                chosenStyle,
                topicQuery,
            );
        } catch (error) {
            logger.error(
                "Erreur lors de la génération du résumé par Gemini :",
                error,
            );
            await interaction.editReply({
                content:
                    "Une erreur est survenue lors de la génération du résumé avec l'IA.",
            });
            return;
        }

        consumeAiQuota(interaction.user.id, roleIds);
        const updatedQuota = checkAiQuota(interaction.user.id, roleIds);

        const channelName =
            "name" in interaction.channel &&
            typeof interaction.channel.name === "string"
                ? interaction.channel.name
                : "discussion";

        const styleLabel = RESUME_STYLE_NAMES[chosenStyle] || "Synthèse";

        const embed = new EmbedBuilder()
            .setTitle(`Résumé : #${channelName} • ${styleLabel}`)
            .setColor(0x5865f2)
            .setDescription(summaryText);

        let periodeStr = "Récemment";
        if (fetchResult.firstMessageDate && fetchResult.lastMessageDate) {
            const startStr = fetchResult.firstMessageDate.toLocaleTimeString(
                "fr-FR",
                {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: config.timezone,
                },
            );
            const endStr = fetchResult.lastMessageDate.toLocaleTimeString(
                "fr-FR",
                {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: config.timezone,
                },
            );
            const startDateStr =
                fetchResult.firstMessageDate.toLocaleDateString("fr-FR", {
                    timeZone: config.timezone,
                });
            const endDateStr = fetchResult.lastMessageDate.toLocaleDateString(
                "fr-FR",
                {
                    timeZone: config.timezone,
                },
            );

            if (startDateStr === endDateStr) {
                periodeStr = `${startDateStr} (${startStr} - ${endStr})`;
            } else {
                periodeStr = `Du ${startDateStr} ${startStr} au ${endDateStr} ${endStr}`;
            }
        }

        embed.addFields({
            name: "Contexte",
            value: `Période : ${periodeStr}\nMessages analysés : ${fetchResult.messageCount}\nParticipants : ${fetchResult.participantCount}`,
            inline: false,
        });

        if (targetMember) {
            embed.addFields({
                name: "Filtre membre",
                value: `<@${targetMember.id}>`,
                inline: true,
            });
        }

        if (topicQuery) {
            embed.addFields({
                name: "Filtre sujet",
                value: topicQuery,
                inline: true,
            });
        }

        const quotaText = updatedQuota.isUnlimited
            ? "Quota : Illimité"
            : `Quota restant : ${updatedQuota.remaining}/${updatedQuota.total}`;

        const requesterName =
            interaction.user.displayName || interaction.user.username;

        embed.setFooter({
            text: `${config.geminiModel} • ${quotaText} • Demandé par ${requesterName}`,
        });

        await interaction.editReply({ embeds: [embed] });
    },
};

import {
    SlashCommandBuilder,
    EmbedBuilder,
    ChatInputCommandInteraction,
    GuildMember,
    ChannelType,
    PermissionFlagsBits,
    TextBasedChannel,
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

const ALLOWED_CATEGORY_IDS = ["1361248660154748958", "1361248850173493288"];

function getChannelCategoryId(channel: TextBasedChannel): string | null {
    if ("isThread" in channel && channel.isThread() && channel.parent) {
        return channel.parent.parentId || null;
    }
    if ("parentId" in channel && channel.parentId) {
        return channel.parentId;
    }
    return null;
}

export default {
    data: new SlashCommandBuilder()
        .setName("resume")
        .setDescription(
            "Génère un résumé intelligent de la discussion avec filtres et styles variés",
        )
        .addChannelOption((option) =>
            option
                .setName("salon")
                .setDescription(
                    "Salon à résumer (laisser vide pour le salon actuel)",
                )
                .addChannelTypes(
                    ChannelType.GuildText,
                    ChannelType.GuildAnnouncement,
                    ChannelType.PublicThread,
                    ChannelType.PrivateThread,
                ),
        )
        .addIntegerOption((option) =>
            option
                .setName("messages")
                .setDescription(
                    "Nombre de messages récents à analyser (ex : 50, 100, max 500)",
                )
                .setMinValue(10)
                .setMaxValue(500),
        )
        .addNumberOption((option) =>
            option
                .setName("depuis_heures")
                .setDescription(
                    "Période en heures (ex : 1 pour 1h, 2 pour 2h, 0.5 pour 30min)",
                )
                .setMinValue(0.1)
                .setMaxValue(720),
        )
        .addStringOption((option) =>
            option
                .setName("depuis_date")
                .setDescription(
                    "Heure ou date de départ (ex : 14:30, hier 20:00, 30/10/2026)",
                ),
        )
        .addStringOption((option) =>
            option
                .setName("depuis_message")
                .setDescription(
                    "Lien d'un message précis (Clic droit -> Copier le lien)",
                ),
        )
        .addUserOption((option) =>
            option
                .setName("membre")
                .setDescription(
                    "Résumer uniquement les messages envoyés par ce membre",
                ),
        )
        .addStringOption((option) =>
            option
                .setName("sujet")
                .setDescription(
                    "Thème ou mot-clé à résumer en priorité (ex : projet, cours, minecraft)",
                ),
        )
        .addStringOption((option) =>
            option
                .setName("style")
                .setDescription(
                    "Format et ton de rédaction du résumé (défaut : Synthèse)",
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
                    {
                        name: "Vulgarisation (accessible et sans jargon)",
                        value: "vulgarisation",
                    },
                ),
        )
        .addStringOption((option) =>
            option
                .setName("inclure_bots")
                .setDescription("Prendre en compte les messages des bots")
                .addChoices(
                    { name: "Non (ignorer les bots)", value: "non" },
                    { name: "Oui (inclure les bots)", value: "oui" },
                ),
        ),

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        const selectedChannel = interaction.options.getChannel("salon");
        const targetChannel = (selectedChannel ||
            interaction.channel) as TextBasedChannel | null;

        if (!targetChannel || !targetChannel.isTextBased()) {
            await interaction.reply({
                content: "Le salon à analyser doit être un salon textuel.",
                ephemeral: true,
            });
            return;
        }

        const isAdmin = interaction.user.id === config.adminId;
        const categoryId = getChannelCategoryId(targetChannel);

        if (
            !isAdmin &&
            (!categoryId || !ALLOWED_CATEGORY_IDS.includes(categoryId))
        ) {
            await interaction.reply({
                content:
                    "Le résumé n'est autorisé que dans les salons des catégories autorisées.",
                ephemeral: true,
            });
            return;
        }

        const member = interaction.member as GuildMember | null;
        if ("guild" in targetChannel && targetChannel.guild) {
            if (member && "permissionsFor" in targetChannel) {
                const userPermissions = targetChannel.permissionsFor(member);
                if (
                    !userPermissions ||
                    !userPermissions.has(PermissionFlagsBits.ViewChannel) ||
                    !userPermissions.has(PermissionFlagsBits.ReadMessageHistory)
                ) {
                    await interaction.reply({
                        content:
                            "Vous ne disposez pas des permissions requises pour lire ce salon.",
                        ephemeral: true,
                    });
                    return;
                }
            }

            const botMember = targetChannel.guild.members.me;
            if (botMember && "permissionsFor" in targetChannel) {
                const botPermissions = targetChannel.permissionsFor(botMember);
                if (
                    !botPermissions ||
                    !botPermissions.has(PermissionFlagsBits.ViewChannel) ||
                    !botPermissions.has(PermissionFlagsBits.ReadMessageHistory)
                ) {
                    await interaction.reply({
                        content:
                            "Le bot ne dispose pas des permissions requises pour lire ce salon.",
                        ephemeral: true,
                    });
                    return;
                }
            }
        }

        if (!config.geminiApiKey) {
            await interaction.reply({
                content:
                    "La fonctionnalité de résumé IA est indisponible (clé GEMINI_API_KEY non configurée).",
                ephemeral: true,
            });
            return;
        }

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

            await interaction.reply({
                embeds: [quotaEmbed],
                ephemeral: true,
            });
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
            interaction.options.getString("inclure_bots") === "oui";

        let parsedDate: Date | undefined = undefined;
        if (depuisDateRaw) {
            const parsed = parseFlexibleDate(depuisDateRaw);
            if (!parsed) {
                await interaction.reply({
                    content:
                        "Format temporel non reconnu pour `depuis_date`. Exemples acceptés : `14:30`, `hier 20:00`, `30/10/2026`, `2h`, `30m`.",
                    ephemeral: true,
                });
                return;
            }
            parsedDate = parsed;
        }

        await interaction.deferReply();

        let fetchResult;
        try {
            fetchResult = await fetchChannelMessages(targetChannel, {
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
            try {
                await interaction.deleteReply();
                await interaction.followUp({
                    content:
                        "Une erreur est survenue lors de la récupération des messages du salon.",
                    ephemeral: true,
                });
            } catch {
                // à ignorer
            }
            return;
        }

        if (fetchResult.messageCount === 0) {
            try {
                await interaction.deleteReply();
                await interaction.followUp({
                    content:
                        "Aucun message ne correspond aux critères de sélection indiqués.",
                    ephemeral: true,
                });
            } catch {
                // à ignorer
            }
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
            try {
                await interaction.deleteReply();
                await interaction.followUp({
                    content:
                        "Une erreur est survenue lors de la génération du résumé avec l'IA.",
                    ephemeral: true,
                });
            } catch {
                // à ignorer
            }
            return;
        }

        consumeAiQuota(interaction.user.id, roleIds);
        const updatedQuota = checkAiQuota(interaction.user.id, roleIds);

        const channelName =
            "name" in targetChannel && typeof targetChannel.name === "string"
                ? targetChannel.name
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

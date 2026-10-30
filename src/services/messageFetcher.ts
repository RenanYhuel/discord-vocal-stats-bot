import { Collection, Message, TextBasedChannel } from "discord.js";
import config from "../config";

export interface FetchMessagesOptions {
    limitCount?: number;
    sinceHours?: number;
    sinceDate?: Date;
    sinceMessageId?: string;
    memberId?: string;
    topic?: string;
    includeBots?: boolean;
}

export interface FetchedMessagesResult {
    formattedTranscript: string;
    messageCount: number;
    participantCount: number;
    firstMessageDate: Date | null;
    lastMessageDate: Date | null;
}

export async function fetchChannelMessages(
    channel: TextBasedChannel,
    options: FetchMessagesOptions = {},
): Promise<FetchedMessagesResult> {
    let targetMessageId: string | null = null;
    if (options.sinceMessageId) {
        const match = options.sinceMessageId.trim().match(/(\d{17,20})$/);
        targetMessageId = match ? match[1] : options.sinceMessageId.trim();
    }

    let cutoffDate: Date | null = options.sinceDate ?? null;
    if (options.sinceHours && options.sinceHours > 0) {
        const calculatedCutoff = new Date(
            Date.now() - options.sinceHours * 3600 * 1000,
        );
        if (!cutoffDate || calculatedCutoff.getTime() > cutoffDate.getTime()) {
            cutoffDate = calculatedCutoff;
        }
    }

    const maxLimit = options.limitCount
        ? Math.min(Math.max(options.limitCount, 5), 500)
        : 500;

    let lastId: string | undefined = undefined;
    const rawMessages: Message[] = [];
    let stopPagination = false;

    while (rawMessages.length < maxLimit && !stopPagination) {
        const fetchBatchSize = Math.min(100, maxLimit - rawMessages.length);
        const batch: Collection<string, Message> = await channel.messages.fetch(
            {
                limit: fetchBatchSize,
                ...(lastId ? { before: lastId } : {}),
            },
        );

        if (batch.size === 0) {
            break;
        }

        for (const msg of batch.values()) {
            if (targetMessageId && BigInt(msg.id) < BigInt(targetMessageId)) {
                stopPagination = true;
                break;
            }

            if (cutoffDate && msg.createdAt.getTime() < cutoffDate.getTime()) {
                stopPagination = true;
                break;
            }

            rawMessages.push(msg);

            if (rawMessages.length >= maxLimit) {
                break;
            }
        }

        lastId = batch.last()?.id;
        if (!lastId || batch.size < fetchBatchSize) {
            break;
        }
    }

    const filtered = rawMessages.filter((msg) => {
        if (msg.system) {
            return false;
        }
        if (!options.includeBots && msg.author.bot) {
            return false;
        }
        if (options.memberId && msg.author.id !== options.memberId) {
            return false;
        }
        return true;
    });

    filtered.reverse();

    if (filtered.length === 0) {
        return {
            formattedTranscript: "",
            messageCount: 0,
            participantCount: 0,
            firstMessageDate: null,
            lastMessageDate: null,
        };
    }

    const participants = new Set<string>();
    const lines = filtered.map((msg) => {
        participants.add(msg.author.id);

        const timeStr = msg.createdAt.toLocaleTimeString("fr-FR", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: config.timezone,
        });
        const dateStr = msg.createdAt.toLocaleDateString("fr-CA", {
            timeZone: config.timezone,
        });
        const authorName =
            msg.member?.displayName ||
            msg.author.displayName ||
            msg.author.username;

        let content = msg.cleanContent || msg.content;
        if (!content.trim()) {
            if (msg.attachments.size > 0) {
                content = "[Fichier / Image]";
            } else if (msg.stickers.size > 0) {
                content = "[Sticker]";
            } else {
                content = "[Message sans contenu textuel]";
            }
        }

        if (content.length > 500) {
            content = `${content.slice(0, 497)}...`;
        }

        return `[${dateStr} ${timeStr}] ${authorName}: ${content.replace(/\r?\n+/g, " ")}`;
    });

    return {
        formattedTranscript: lines.join("\n"),
        messageCount: filtered.length,
        participantCount: participants.size,
        firstMessageDate: filtered[0].createdAt,
        lastMessageDate: filtered[filtered.length - 1].createdAt,
    };
}

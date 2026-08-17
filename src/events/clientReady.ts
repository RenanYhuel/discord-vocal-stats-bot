import logger from "../utils/logger";
import config from "../config";
import db from "../database/db";
import { recordCompletedSession } from "../managers/voiceManager";
import { startCronTasks } from "../cron/scheduler";
import { Client, TextChannel, Message, Events } from "discord.js";
import {
    messages,
    state,
    voiceEvents,
    voiceCurrent,
    voiceSessions,
} from "../database/schema";
import { eq, and, lte, desc } from "drizzle-orm";

interface DBLastJoinQuery {
    timestamp: string;
}

interface DBActiveUserQuery {
    user_id: string;
    username: string;
    channel_id: string;
    channel_name: string;
    joined_at: string;
}

export default {
    name: Events.ClientReady,
    once: true,
    async execute(client: Client): Promise<void> {
        logger.info(`🤖 Connecté en tant que ${client.user?.tag}`);

        try {
            await catchUp(client);
            await syncActiveVoiceStates(client);
            setStateValue("bot_last_seen_at", new Date().toISOString());
            startCronTasks(client);
        } catch (err) {
            logger.error(
                "Erreur critique lors de l'initialisation au démarrage",
                err,
            );
        }
    },
};

function setStateValue(key: string, value: string): void {
    db.insert(state)
        .values({ key, value })
        .onConflictDoUpdate({
            target: state.key,
            set: { value },
        })
        .run();
}

async function catchUp(client: Client): Promise<void> {
    if (!config.carlLogChannelId) {
        return;
    }
    const channel = (await client.channels
        .fetch(config.carlLogChannelId)
        .catch(() => null)) as TextChannel | null;
    if (!channel) {
        return;
    }

    const lastMessageState = db
        .select()
        .from(state)
        .where(eq(state.key, "last_message_id"))
        .get();
    let lastMessageId = lastMessageState?.value;
    if (!lastMessageId) {
        return;
    }

    let hasMore = true;
    while (hasMore) {
        const fetchedMessages = await channel.messages
            .fetch({ limit: 100, after: lastMessageId })
            .catch(() => null);
        if (!fetchedMessages || fetchedMessages.size === 0) {
            hasMore = false;
            break;
        }
        const sortedMessages: Message[] = Array.from(
            fetchedMessages.values(),
        ).sort((a, b) => a.createdTimestamp - b.createdTimestamp);

        for (const msg of sortedMessages) {
            db.insert(messages)
                .values({
                    id: msg.id,
                    channelId: msg.channelId,
                    guildId: msg.guildId || "",
                    authorId: msg.author.id,
                    authorName: msg.author.username,
                    content: msg.content,
                    embeds: JSON.stringify(msg.embeds),
                    attachments: JSON.stringify(msg.attachments),
                    createdAt: msg.createdAt.toISOString(),
                })
                .onConflictDoNothing()
                .run();

            if (msg.embeds && msg.embeds.length > 0) {
                msg.embeds.forEach((embed) => {
                    const title = embed.title || "";
                    const descVal = embed.description || "";
                    let type: "voice_join" | "voice_leave" | null = null;
                    if (title === "Member joined voice channel") {
                        type = "voice_join";
                    }
                    if (title === "Member left voice channel") {
                        type = "voice_leave";
                    }

                    if (type) {
                        let userId: string | null = null;
                        if (embed.footer && embed.footer.text) {
                            const match =
                                embed.footer.text.match(/ID:\s*(\d+)/i);
                            if (match) {
                                userId = match[1];
                            }
                        }
                        const userMatch = descVal.match(/\*\*(.+?)\*\*/);
                        const chanMatch = descVal.match(/#(.+)/);

                        if (userId && userMatch && chanMatch) {
                            const username = userMatch[1];
                            const channelName = chanMatch[1];
                            const timestampStr = msg.createdAt.toISOString();
                            const unixSec = Math.floor(
                                new Date(timestampStr).getTime() / 5000,
                            );
                            const dedupHash = `${userId}_${type}_${unixSec}`;

                            try {
                                db.insert(voiceEvents)
                                    .values({
                                        messageId: msg.id,
                                        userName: username,
                                        userId,
                                        channelName,
                                        type,
                                        timestamp: timestampStr,
                                        dedupHash,
                                        raw: JSON.stringify(embed),
                                    })
                                    .run();

                                if (type === "voice_leave") {
                                    const lastJoin = db
                                        .select({
                                            timestamp: voiceEvents.timestamp,
                                        })
                                        .from(voiceEvents)
                                        .where(
                                            and(
                                                eq(voiceEvents.userId, userId),
                                                eq(
                                                    voiceEvents.type,
                                                    "voice_join",
                                                ),
                                                lte(
                                                    voiceEvents.timestamp,
                                                    timestampStr,
                                                ),
                                            ),
                                        )
                                        .orderBy(desc(voiceEvents.timestamp))
                                        .limit(1)
                                        .get() as DBLastJoinQuery | undefined;

                                    if (lastJoin) {
                                        recordCompletedSession(
                                            client,
                                            userId,
                                            username,
                                            channelName,
                                            lastJoin.timestamp,
                                            timestampStr,
                                        );
                                    }
                                }
                            } catch (err) {
                                // à ignorer
                            }
                        }
                    }
                });
            }
            lastMessageId = msg.id;
            db.insert(state)
                .values({ key: "last_message_id", value: lastMessageId })
                .onConflictDoUpdate({
                    target: state.key,
                    set: { value: lastMessageId },
                })
                .run();
        }
    }
}

async function syncActiveVoiceStates(client: Client): Promise<void> {
    const guild = await client.guilds.fetch(config.guildId).catch(() => null);
    if (!guild) {
        return;
    }

    const realActiveUsers = new Map<
        string,
        {
            username: string;
            channelName: string;
            channelId: string;
            isDeaf: number;
        }
    >();
    guild.voiceStates.cache.forEach((vs) => {
        if (vs.channelId && vs.member) {
            realActiveUsers.set(vs.id, {
                username: vs.member.user.username,
                channelName: vs.channel ? vs.channel.name : "Vocal",
                channelId: vs.channelId,
                isDeaf: vs.selfDeaf || vs.serverDeaf ? 1 : 0,
            });
        }
    });

    const dbActiveUsers = db
        .select({
            user_id: voiceCurrent.userId,
            username: voiceCurrent.username,
            channel_id: voiceCurrent.channelId,
            channel_name: voiceCurrent.channelName,
            joined_at: voiceCurrent.joinedAt,
        })
        .from(voiceCurrent)
        .all() as DBActiveUserQuery[];

    const timestamp = new Date().toISOString();
    const lastSeenState = db
        .select()
        .from(state)
        .where(eq(state.key, "bot_last_seen_at"))
        .get();
    const lastReliableTimestamp = lastSeenState?.value || null;

    const wasSessionAlreadyClosed = (userId: string, joinedAt: string): boolean =>
        !!db
            .select({ id: voiceSessions.id })
            .from(voiceSessions)
            .where(
                and(
                    eq(voiceSessions.userId, userId),
                    eq(voiceSessions.joinTime, joinedAt),
                ),
            )
            .limit(1)
            .get();

    const getReliableLeaveTimestamp = (joinedAt: string): string => {
        if (!lastReliableTimestamp) {
            return joinedAt;
        }
        if (new Date(lastReliableTimestamp).getTime() <= new Date(joinedAt).getTime()) {
            return joinedAt;
        }
        return lastReliableTimestamp;
    };

    dbActiveUsers.forEach((dbUser) => {
        const alreadyClosedByCatchUp = wasSessionAlreadyClosed(
            dbUser.user_id,
            dbUser.joined_at,
        );

        if (!realActiveUsers.has(dbUser.user_id)) {
            if (alreadyClosedByCatchUp) {
                db.delete(voiceCurrent)
                    .where(eq(voiceCurrent.userId, dbUser.user_id))
                    .run();
                return;
            }

            const leaveTimestamp = getReliableLeaveTimestamp(dbUser.joined_at);
            try {
                const unixSec = Math.floor(
                    new Date(leaveTimestamp).getTime() / 5000,
                );
                db.insert(voiceEvents)
                    .values({
                        messageId: `sync_leave_${dbUser.user_id}`,
                        userName: dbUser.username,
                        userId: dbUser.user_id,
                        channelName: dbUser.channel_name,
                        type: "voice_leave",
                        timestamp: leaveTimestamp,
                        dedupHash: `${dbUser.user_id}_voice_leave_${unixSec}`,
                        raw: JSON.stringify({ source: "sync" }),
                    })
                    .run();

                recordCompletedSession(
                    client,
                    dbUser.user_id,
                    dbUser.username,
                    dbUser.channel_name,
                    dbUser.joined_at,
                    leaveTimestamp,
                );
            } catch (err) {
                // à ignorer
            }
            db.delete(voiceCurrent)
                .where(eq(voiceCurrent.userId, dbUser.user_id))
                .run();
        }
    });

    realActiveUsers.forEach((data, userId) => {
        const dbUser = dbActiveUsers.find((dbU) => dbU.user_id === userId);

        if (dbUser) {
            const alreadyClosedByCatchUp = wasSessionAlreadyClosed(
                dbUser.user_id,
                dbUser.joined_at,
            );

            if (!alreadyClosedByCatchUp) {
                const leaveTimestamp = getReliableLeaveTimestamp(dbUser.joined_at);
                try {
                    const unixSec = Math.floor(
                        new Date(leaveTimestamp).getTime() / 5000,
                    );
                    db.insert(voiceEvents)
                        .values({
                            messageId: `sync_leave_${userId}`,
                            userName: dbUser.username,
                            userId,
                            channelName: dbUser.channel_name,
                            type: "voice_leave",
                            timestamp: leaveTimestamp,
                            dedupHash: `${userId}_voice_leave_${unixSec}`,
                            raw: JSON.stringify({ source: "sync" }),
                        })
                        .run();

                    recordCompletedSession(
                        client,
                        userId,
                        dbUser.username,
                        dbUser.channel_name,
                        dbUser.joined_at,
                        leaveTimestamp,
                    );
                } catch (err) {
                    // à ignorer
                }
            }

            try {
                const unixSec = Math.floor(new Date(timestamp).getTime() / 5000);
                db.insert(voiceEvents)
                    .values({
                        messageId: `sync_join_${userId}`,
                        userName: data.username,
                        userId,
                        channelName: data.channelName,
                        type: "voice_join",
                        timestamp,
                        dedupHash: `${userId}_voice_join_${unixSec}`,
                        raw: JSON.stringify({ source: "sync" }),
                    })
                    .run();
            } catch (err) {
                // à ignorer
            }

            db.insert(voiceCurrent)
                .values({
                    userId,
                    username: data.username,
                    channelId: data.channelId,
                    channelName: data.channelName,
                    joinedAt: timestamp,
                    isDeaf: data.isDeaf,
                    deafenedAt: data.isDeaf ? timestamp : null,
                })
                .onConflictDoUpdate({
                    target: voiceCurrent.userId,
                    set: {
                        username: data.username,
                        channelId: data.channelId,
                        channelName: data.channelName,
                        joinedAt: timestamp,
                        isDeaf: data.isDeaf,
                        deafenedAt: data.isDeaf ? timestamp : null,
                    },
                })
                .run();
            return;
        }

        if (!dbUser) {
            try {
                const unixSec = Math.floor(
                    new Date(timestamp).getTime() / 5000,
                );
                db.insert(voiceEvents)
                    .values({
                        messageId: `sync_join_${userId}`,
                        userName: data.username,
                        userId,
                        channelName: data.channelName,
                        type: "voice_join",
                        timestamp,
                        dedupHash: `${userId}_voice_join_${unixSec}`,
                        raw: JSON.stringify({ source: "sync" }),
                    })
                    .run();
            } catch (err) {
                // à ignorer
            }

            db.insert(voiceCurrent)
                .values({
                    userId,
                    username: data.username,
                    channelId: data.channelId,
                    channelName: data.channelName,
                    joinedAt: timestamp,
                    isDeaf: data.isDeaf,
                    deafenedAt: data.isDeaf ? timestamp : null,
                })
                .onConflictDoUpdate({
                    target: voiceCurrent.userId,
                    set: {
                        username: data.username,
                        channelId: data.channelId,
                        channelName: data.channelName,
                        joinedAt: timestamp,
                        isDeaf: data.isDeaf,
                        deafenedAt: data.isDeaf ? timestamp : null,
                    },
                })
                .run();
        }
    });
}

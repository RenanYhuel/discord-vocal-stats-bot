import db from "../database/db";
import logger from "../utils/logger";
import {
    recordCompletedSession,
    recordDeafSession,
    checkRankOvertake,
} from "../managers/voiceManager";
import { VoiceState, Client } from "discord.js";
import { voiceEvents, voiceCurrent } from "../database/schema";
import { eq } from "drizzle-orm";

interface DBActiveQuery {
    joinedAt: string;
    isDeaf: number;
    deafenedAt: string | null;
}

export default {
    name: "voiceStateUpdate",
    async execute(
        oldState: VoiceState,
        newState: VoiceState,
        client: Client,
    ): Promise<void> {
        const userId = newState.id;
        const username = newState.member
            ? newState.member.user.username
            : "Inconnu";
        const timestamp = new Date().toISOString();
        const unixSec = Math.floor(new Date(timestamp).getTime() / 5000);

        if (!oldState.channelId && newState.channelId && newState.channel) {
            try {
                db.insert(voiceEvents)
                    .values({
                        messageId: `live_join_${userId}_${Date.now()}`,
                        userName: username,
                        userId,
                        channelName: newState.channel.name,
                        type: "voice_join",
                        timestamp,
                        dedupHash: `${userId}_voice_join_${unixSec}`,
                        raw: JSON.stringify({ source: "live" }),
                    })
                    .run();

                const isDeaf = newState.selfDeaf || newState.serverDeaf ? 1 : 0;
                db.insert(voiceCurrent)
                    .values({
                        userId,
                        username,
                        channelId: newState.channelId,
                        channelName: newState.channel.name,
                        joinedAt: timestamp,
                        isDeaf,
                        deafenedAt: isDeaf ? timestamp : null,
                    })
                    .onConflictDoUpdate({
                        target: voiceCurrent.userId,
                        set: {
                            username,
                            channelId: newState.channelId,
                            channelName: newState.channel.name,
                            joinedAt: timestamp,
                            isDeaf,
                            deafenedAt: isDeaf ? timestamp : null,
                        },
                    })
                    .run();
            } catch (err) {
                // à ignorer
            }
        } else if (
            oldState.channelId &&
            !newState.channelId &&
            oldState.channel
        ) {
            try {
                db.insert(voiceEvents)
                    .values({
                        messageId: `live_leave_${userId}_${Date.now()}`,
                        userName: username,
                        userId,
                        channelName: oldState.channel.name,
                        type: "voice_leave",
                        timestamp,
                        dedupHash: `${userId}_voice_leave_${unixSec}`,
                        raw: JSON.stringify({ source: "live" }),
                    })
                    .run();

                const current = db
                    .select({
                        joinedAt: voiceCurrent.joinedAt,
                        isDeaf: voiceCurrent.isDeaf,
                        deafenedAt: voiceCurrent.deafenedAt,
                    })
                    .from(voiceCurrent)
                    .where(eq(voiceCurrent.userId, userId))
                    .get() as DBActiveQuery | undefined;

                if (current) {
                    if (current.isDeaf && current.deafenedAt) {
                        recordDeafSession(
                            userId,
                            username,
                            oldState.channel.name,
                            current.deafenedAt,
                            timestamp,
                        );
                    }
                    recordCompletedSession(
                        client,
                        userId,
                        username,
                        oldState.channel.name,
                        current.joinedAt,
                        timestamp,
                    );
                }
                db.delete(voiceCurrent)
                    .where(eq(voiceCurrent.userId, userId))
                    .run();
            } catch (err) {
                // à ignorer
            }
        } else if (
            oldState.channelId &&
            newState.channelId &&
            oldState.channelId !== newState.channelId &&
            oldState.channel &&
            newState.channel
        ) {
            try {
                db.insert(voiceEvents)
                    .values({
                        messageId: `live_leave_${userId}_${Date.now()}`,
                        userName: username,
                        userId: userId,
                        channelName: oldState.channel.name,
                        type: "voice_leave",
                        timestamp,
                        dedupHash: `${userId}_voice_leave_${unixSec}`,
                        raw: JSON.stringify({ source: "live_move" }),
                    })
                    .run();

                db.insert(voiceEvents)
                    .values({
                        messageId: `live_join_${userId}_${Date.now()}`,
                        userName: username,
                        userId: userId,
                        channelName: newState.channel.name,
                        type: "voice_join",
                        timestamp,
                        dedupHash: `${userId}_voice_join_${unixSec}`,
                        raw: JSON.stringify({ source: "live_move" }),
                    })
                    .run();

                const current = db
                    .select({
                        joinedAt: voiceCurrent.joinedAt,
                        isDeaf: voiceCurrent.isDeaf,
                        deafenedAt: voiceCurrent.deafenedAt,
                    })
                    .from(voiceCurrent)
                    .where(eq(voiceCurrent.userId, userId))
                    .get() as DBActiveQuery | undefined;

                if (current) {
                    if (current.isDeaf && current.deafenedAt) {
                        recordDeafSession(
                            userId,
                            username,
                            oldState.channel.name,
                            current.deafenedAt,
                            timestamp,
                        );
                    }
                    recordCompletedSession(
                        client,
                        userId,
                        username,
                        oldState.channel.name,
                        current.joinedAt,
                        timestamp,
                    );
                }

                const isDeaf = newState.selfDeaf || newState.serverDeaf ? 1 : 0;
                db.insert(voiceCurrent)
                    .values({
                        userId,
                        username,
                        channelId: newState.channelId,
                        channelName: newState.channel.name,
                        joinedAt: timestamp,
                        isDeaf,
                        deafenedAt: isDeaf ? timestamp : null,
                    })
                    .onConflictDoUpdate({
                        target: voiceCurrent.userId,
                        set: {
                            username,
                            channelId: newState.channelId,
                            channelName: newState.channel.name,
                            joinedAt: timestamp,
                            isDeaf,
                            deafenedAt: isDeaf ? timestamp : null,
                        },
                    })
                    .run();
            } catch (err) {
                // à ignorer
            }
        }

        if (
            oldState.channelId &&
            newState.channelId &&
            oldState.channelId === newState.channelId &&
            newState.channel
        ) {
            const wasDeaf = oldState.selfDeaf || oldState.serverDeaf;
            const isDeaf = newState.selfDeaf || newState.serverDeaf;

            if (!wasDeaf && isDeaf) {
                db.update(voiceCurrent)
                    .set({ isDeaf: 1, deafenedAt: timestamp })
                    .where(eq(voiceCurrent.userId, userId))
                    .run();
                logger.info(`[DEAF] ${username} s'est mis en sourdine casque.`);
            } else if (wasDeaf && !isDeaf) {
                const current = db
                    .select({
                        deafenedAt: voiceCurrent.deafenedAt,
                    })
                    .from(voiceCurrent)
                    .where(eq(voiceCurrent.userId, userId))
                    .get() as { deafenedAt: string | null } | undefined;

                if (current && current.deafenedAt) {
                    recordDeafSession(
                        userId,
                        username,
                        newState.channel.name,
                        current.deafenedAt,
                        timestamp,
                    );
                }
                db.update(voiceCurrent)
                    .set({ isDeaf: 0, deafenedAt: null })
                    .where(eq(voiceCurrent.userId, userId))
                    .run();
                logger.info(`[DEAF] ${username} a réactivé son casque.`);
            }
        }

        if (newState.channelId) {
            const activeUser = db
                .select({
                    joinedAt: voiceCurrent.joinedAt,
                })
                .from(voiceCurrent)
                .where(eq(voiceCurrent.userId, userId))
                .get() as { joinedAt: string } | undefined;

            if (activeUser) {
                const currentDurationSec = Math.floor(
                    (new Date().getTime() -
                        new Date(activeUser.joinedAt).getTime()) /
                        1000,
                );
                if (currentDurationSec > 60) {
                    await checkRankOvertake(
                        client,
                        userId,
                        username,
                        currentDurationSec,
                    );
                }
            }
        }
    },
};

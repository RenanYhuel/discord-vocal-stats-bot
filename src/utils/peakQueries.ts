import db from "../database/db";
import { voiceSessions } from "../database/schema";
import { sql, and, eq } from "drizzle-orm";

export interface PeakGathering {
    channelName: string;
    startTime: number;
    endTime: number;
    durationSec: number;
    peakCount: number;
    peakTime: number;
    peakUsers: { userId: string; userName: string }[];
    totalParticipants: number;
}

export interface GetPeakGatheringsOptions {
    year?: number;
    channelName?: string;
    limit?: number;
}

interface DBVoiceSessionRow {
    userId: string;
    userName: string;
    channelName: string;
    joinTime: string;
    leaveTime: string;
    durationSec: number;
}

interface TimelineEvent {
    time: number;
    type: "leave" | "join";
    userId: string;
    userName: string;
}

export function getPeakGatherings(
    options: GetPeakGatheringsOptions = {},
): PeakGathering[] {
    const conditions = [sql`${voiceSessions.durationSec} > 0`];

    if (options.year) {
        conditions.push(
            sql`strftime('%Y', ${voiceSessions.joinTime}) = ${String(options.year)}`,
        );
    }

    if (options.channelName) {
        conditions.push(eq(voiceSessions.channelName, options.channelName));
    }

    const sessions = db
        .select({
            userId: voiceSessions.userId,
            userName: voiceSessions.userName,
            channelName: voiceSessions.channelName,
            joinTime: voiceSessions.joinTime,
            leaveTime: voiceSessions.leaveTime,
            durationSec: voiceSessions.durationSec,
        })
        .from(voiceSessions)
        .where(and(...conditions))
        .orderBy(sql`${voiceSessions.joinTime} ASC`)
        .all() as DBVoiceSessionRow[];

    if (sessions.length === 0) {
        return [];
    }

    const channelMap = new Map<string, DBVoiceSessionRow[]>();
    for (const session of sessions) {
        const list = channelMap.get(session.channelName) || [];
        list.push(session);
        channelMap.set(session.channelName, list);
    }

    const GRACE_PERIOD_MS = 5 * 60 * 1000;
    const allGatherings: PeakGathering[] = [];

    for (const [channelName, chanSessions] of channelMap.entries()) {
        const events: TimelineEvent[] = [];

        for (const s of chanSessions) {
            const start = new Date(s.joinTime).getTime();
            const end = new Date(s.leaveTime).getTime();
            if (end > start) {
                events.push({
                    time: start,
                    type: "join",
                    userId: s.userId,
                    userName: s.userName,
                });
                events.push({
                    time: end,
                    type: "leave",
                    userId: s.userId,
                    userName: s.userName,
                });
            }
        }

        events.sort(
            (a, b) => a.time - b.time || (a.type === "leave" ? -1 : 1),
        );

        const userRefCounts = new Map<string, number>();
        const userNames = new Map<string, string>();
        let inGathering = false;
        let gatheringStartTime = 0;
        let gatheringLastActiveTime = 0;
        let gatheringPeakCount = 0;
        let gatheringPeakTime = 0;
        let gatheringPeakUsers: { userId: string; userName: string }[] = [];
        const gatheringAllUsers = new Map<string, string>();

        for (let i = 0; i < events.length; i++) {
            const ev = events[i];

            if (ev.type === "join") {
                userRefCounts.set(
                    ev.userId,
                    (userRefCounts.get(ev.userId) || 0) + 1,
                );
                userNames.set(ev.userId, ev.userName);
            } else {
                const currentCount = userRefCounts.get(ev.userId) || 1;
                if (currentCount <= 1) {
                    userRefCounts.delete(ev.userId);
                } else {
                    userRefCounts.set(ev.userId, currentCount - 1);
                }
            }

            const activeCount = userRefCounts.size;

            if (activeCount >= 2) {
                if (!inGathering) {
                    inGathering = true;
                    gatheringStartTime = ev.time;
                    gatheringPeakCount = activeCount;
                    gatheringPeakTime = ev.time;
                    gatheringPeakUsers = Array.from(
                        userRefCounts.keys(),
                    ).map((uid) => ({
                        userId: uid,
                        userName: userNames.get(uid) || "Membre",
                    }));
                    gatheringAllUsers.clear();
                    for (const uid of userRefCounts.keys()) {
                        gatheringAllUsers.set(
                            uid,
                            userNames.get(uid) || "Membre",
                        );
                    }
                } else {
                    for (const uid of userRefCounts.keys()) {
                        gatheringAllUsers.set(
                            uid,
                            userNames.get(uid) || "Membre",
                        );
                    }
                    if (activeCount > gatheringPeakCount) {
                        gatheringPeakCount = activeCount;
                        gatheringPeakTime = ev.time;
                        gatheringPeakUsers = Array.from(
                            userRefCounts.keys(),
                        ).map((uid) => ({
                            userId: uid,
                            userName: userNames.get(uid) || "Membre",
                        }));
                    }
                }
                gatheringLastActiveTime = ev.time;
            } else if (inGathering) {
                const nextEv = events[i + 1];
                if (
                    !nextEv ||
                    nextEv.time - gatheringLastActiveTime > GRACE_PERIOD_MS
                ) {
                    if (gatheringPeakCount >= 2) {
                        allGatherings.push({
                            channelName,
                            startTime: gatheringStartTime,
                            endTime: gatheringLastActiveTime,
                            durationSec: Math.max(
                                0,
                                Math.floor(
                                    (gatheringLastActiveTime -
                                        gatheringStartTime) /
                                        1000,
                                ),
                            ),
                            peakCount: gatheringPeakCount,
                            peakTime: gatheringPeakTime,
                            peakUsers: gatheringPeakUsers,
                            totalParticipants: gatheringAllUsers.size,
                        });
                    }
                    inGathering = false;
                    gatheringPeakCount = 0;
                    gatheringPeakUsers = [];
                    gatheringAllUsers.clear();
                }
            }
        }

        if (inGathering && gatheringPeakCount >= 2) {
            allGatherings.push({
                channelName,
                startTime: gatheringStartTime,
                endTime: gatheringLastActiveTime,
                durationSec: Math.max(
                    0,
                    Math.floor(
                        (gatheringLastActiveTime - gatheringStartTime) / 1000,
                    ),
                ),
                peakCount: gatheringPeakCount,
                peakTime: gatheringPeakTime,
                peakUsers: gatheringPeakUsers,
                totalParticipants: gatheringAllUsers.size,
            });
        }
    }

    allGatherings.sort((a, b) => {
        if (b.peakCount !== a.peakCount) {
            return b.peakCount - a.peakCount;
        }
        if (b.durationSec !== a.durationSec) {
            return b.durationSec - a.durationSec;
        }
        return b.startTime - a.startTime;
    });

    const limit = Math.min(Math.max(options.limit || 5, 1), 10);
    return allGatherings.slice(0, limit);
}

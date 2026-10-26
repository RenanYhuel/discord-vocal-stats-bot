import db from "../database/db";
import { voiceSessions } from "../database/schema";
import { eq, sql } from "drizzle-orm";

export interface DuoCompatibilityResult {
    score: number;
    title: string;
    description: string;
    sharedSeconds: number;
    sharedChannels: { name: string; sec: number }[];
    favoriteCommonChannel: string;
    commonHourRange: string;
}

export interface DuoMatchResult {
    targetUserId: string;
    targetUserName: string;
    score: number;
    sharedSeconds: number;
}

export function calculateDuoCompatibility(userId1: string, userId2: string): DuoCompatibilityResult {
    const s1 = db
        .select({
            channelName: voiceSessions.channelName,
            joinTime: voiceSessions.joinTime,
            leaveTime: voiceSessions.leaveTime,
            durationSec: voiceSessions.durationSec,
        })
        .from(voiceSessions)
        .where(eq(voiceSessions.userId, userId1))
        .all();

    const s2 = db
        .select({
            channelName: voiceSessions.channelName,
            joinTime: voiceSessions.joinTime,
            leaveTime: voiceSessions.leaveTime,
            durationSec: voiceSessions.durationSec,
        })
        .from(voiceSessions)
        .where(eq(voiceSessions.userId, userId2))
        .all();

    const totalSec1 = s1.reduce((acc, row) => acc + row.durationSec, 0);
    const totalSec2 = s2.reduce((acc, row) => acc + row.durationSec, 0);

    let sharedSeconds = 0;
    const commonChannelsMap = new Map<string, number>();
    const commonHoursMap = new Map<number, number>();

    for (const row1 of s1) {
        const s1Join = new Date(row1.joinTime).getTime();
        const s1Leave = new Date(row1.leaveTime).getTime();

        for (const row2 of s2) {
            const s2Join = new Date(row2.joinTime).getTime();
            const s2Leave = new Date(row2.leaveTime).getTime();

            const overlapMs = Math.max(0, Math.min(s1Leave, s2Leave) - Math.max(s1Join, s2Join));
            const overlapSec = Math.floor(overlapMs / 1000);

            if (overlapSec > 0) {
                sharedSeconds += overlapSec;
                commonChannelsMap.set(
                    row1.channelName,
                    (commonChannelsMap.get(row1.channelName) || 0) + overlapSec
                );

                const hour = new Date(s1Join).getUTCHours();
                commonHoursMap.set(hour, (commonHoursMap.get(hour) || 0) + overlapSec);
            }
        }
    }

    const minTotal = Math.min(totalSec1, totalSec2);
    let overlapScore = 0;
    if (minTotal > 0) {
        overlapScore = Math.min(60, Math.round((sharedSeconds / minTotal) * 60));
    }

    const chans1 = new Set(s1.map((r) => r.channelName));
    const chans2 = new Set(s2.map((r) => r.channelName));
    const commonChansCount = Array.from(chans1).filter((c) => chans2.has(c)).length;
    const allChansCount = new Set([...chans1, ...chans2]).size;
    const channelScore = allChansCount > 0 ? Math.round((commonChansCount / allChansCount) * 20) : 0;

    const basePresenceScore = (totalSec1 > 0 && totalSec2 > 0) ? 20 : 0;
    const score = Math.max(1, Math.min(100, overlapScore + channelScore + basePresenceScore));

    let title = "Inconnus de couloir";
    let description = "Vos chemins se croisent à peine. Une discussion s'impose !";

    if (score >= 90) {
        title = "Âmes Sœurs Vocales";
        description = "Une symbiose totale. L'un ne commence pas une session sans l'autre.";
    } else if (score >= 75) {
        title = "Duo Inséparable";
        description = "Une très grande complicité. Les mêmes salons, les mêmes heures, toujours au rendez-vous.";
    } else if (score >= 55) {
        title = "Complices Réguliers";
        description = "De très bons moments passés ensemble et des habitudes bien partagées.";
    } else if (score >= 35) {
        title = "Camarades de Salon";
        description = "Vous vous croisez souvent dans les mêmes espaces mais sans être collés 24h/24.";
    } else if (score >= 15) {
        title = "Connaissances Vocales";
        description = "Vous avez déjà partagé quelques échanges mais vos rythmes diffèrent.";
    }

    const sortedChans = Array.from(commonChannelsMap.entries())
        .map(([name, sec]) => ({ name, sec }))
        .sort((a, b) => b.sec - a.sec);

    const favoriteCommonChannel = sortedChans.length > 0 ? sortedChans[0].name : "Aucun salon commun";

    let commonHourRange = "Variable";
    if (commonHoursMap.size > 0) {
        const topHour = Array.from(commonHoursMap.entries()).sort((a, b) => b[1] - a[1])[0][0];
        const localHour = (topHour + 2) % 24;
        commonHourRange = `${localHour}h - ${(localHour + 3) % 24}h`;
    }

    return {
        score,
        title,
        description,
        sharedSeconds,
        sharedChannels: sortedChans,
        favoriteCommonChannel,
        commonHourRange,
    };
}

export function findBestDuoMatch(userId: string): DuoMatchResult | null {
    const candidateUsers = db
        .select({
            userId: voiceSessions.userId,
            userName: voiceSessions.userName,
        })
        .from(voiceSessions)
        .where(sql`${voiceSessions.userId} != ${userId}`)
        .groupBy(voiceSessions.userId)
        .all() as { userId: string; userName: string }[];

    if (candidateUsers.length === 0) {
        return null;
    }

    let bestMatch: DuoMatchResult | null = null;

    for (const cand of candidateUsers) {
        const result = calculateDuoCompatibility(userId, cand.userId);
        if (!bestMatch || result.score > bestMatch.score || (result.score === bestMatch.score && result.sharedSeconds > bestMatch.sharedSeconds)) {
            bestMatch = {
                targetUserId: cand.userId,
                targetUserName: cand.userName,
                score: result.score,
                sharedSeconds: result.sharedSeconds,
            };
        }
    }

    return bestMatch;
}

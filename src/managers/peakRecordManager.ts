import {
    Client,
    EmbedBuilder,
    TextChannel,
    VoiceBasedChannel,
} from "discord.js";
import config from "../config";
import logger from "../utils/logger";
import { formatDurationStandard } from "../utils/formatters";
import { getPeakGatherings } from "../utils/peakQueries";

interface LiveGathering {
    channelId: string;
    channelName: string;
    startTime: number;
    lastActiveTime: number;
    peakCount: number;
    peakTime: number;
    peakMembers: { userId: string; username: string }[];
    timeoutHandle?: NodeJS.Timeout;
}

const activeGatherings = new Map<string, LiveGathering>();
const GRACE_PERIOD_MS = 5 * 60 * 1000;

export function initLiveGatherings(client: Client): void {
    try {
        for (const guild of client.guilds.cache.values()) {
            for (const channel of guild.channels.cache.values()) {
                if (channel.isVoiceBased()) {
                    const humans = channel.members.filter((m) => !m.user.bot);
                    if (humans.size >= 2) {
                        activeGatherings.set(channel.id, {
                            channelId: channel.id,
                            channelName: channel.name,
                            startTime: Date.now(),
                            lastActiveTime: Date.now(),
                            peakCount: humans.size,
                            peakTime: Date.now(),
                            peakMembers: humans.map((m) => ({
                                userId: m.id,
                                username: m.displayName || m.user.username,
                            })),
                        });
                    }
                }
            }
        }
    } catch (err) {
        logger.error(
            "Erreur lors de l'initialisation des rassemblements vocaux :",
            err,
        );
    }
}

export function handleVoiceGatheringUpdate(
    client: Client,
    oldChannel: VoiceBasedChannel | null,
    newChannel: VoiceBasedChannel | null,
): void {
    const channelsToCheck = new Set<VoiceBasedChannel>();
    if (oldChannel) {
        channelsToCheck.add(oldChannel);
    }
    if (newChannel) {
        channelsToCheck.add(newChannel);
    }

    for (const channel of channelsToCheck) {
        processChannel(client, channel);
    }
}

function processChannel(client: Client, channel: VoiceBasedChannel): void {
    const humans = channel.members.filter((m) => !m.user.bot);
    const count = humans.size;
    const existing = activeGatherings.get(channel.id);

    if (count >= 2) {
        if (existing) {
            if (existing.timeoutHandle) {
                clearTimeout(existing.timeoutHandle);
                existing.timeoutHandle = undefined;
            }
            existing.lastActiveTime = Date.now();
            existing.channelName = channel.name;
            if (count > existing.peakCount) {
                existing.peakCount = count;
                existing.peakTime = Date.now();
                existing.peakMembers = humans.map((m) => ({
                    userId: m.id,
                    username: m.displayName || m.user.username,
                }));
            }
        } else {
            activeGatherings.set(channel.id, {
                channelId: channel.id,
                channelName: channel.name,
                startTime: Date.now(),
                lastActiveTime: Date.now(),
                peakCount: count,
                peakTime: Date.now(),
                peakMembers: humans.map((m) => ({
                    userId: m.id,
                    username: m.displayName || m.user.username,
                })),
            });
        }
    } else if (existing) {
        if (!existing.timeoutHandle) {
            existing.timeoutHandle = setTimeout(async () => {
                activeGatherings.delete(channel.id);
                await concludeAndAnnounceGathering(client, existing);
            }, GRACE_PERIOD_MS);
        }
    }
}

async function concludeAndAnnounceGathering(
    client: Client,
    gathering: LiveGathering,
): Promise<void> {
    if (!config.statsChannelId) {
        return;
    }

    if (gathering.peakCount < 3) {
        return;
    }

    const durationSec = Math.max(
        0,
        Math.floor((gathering.lastActiveTime - gathering.startTime) / 1000),
    );

    if (durationSec < 60) {
        return;
    }

    try {
        const statsChannel = (await client.channels
            .fetch(config.statsChannelId)
            .catch(() => null)) as TextChannel | null;

        if (!statsChannel) {
            return;
        }

        const previousRankings = getPeakGatherings({
            limit: 3,
            beforeTime: gathering.startTime,
        });

        const prevTop1 = previousRankings[0]?.peakCount || 0;
        const prevTop3 = previousRankings[2]?.peakCount || 0;

        let title = "";
        let description = "";
        let isRecord = false;

        if (previousRankings.length === 0) {
            if (gathering.peakCount >= 4) {
                isRecord = true;
                title = "Nouveau record absolu d'affluence en vocal";
                description = `Le rassemblement qui vient de s'achever dans #${gathering.channelName} a établi le premier record historique d'affluence du serveur !`;
            }
        } else if (gathering.peakCount > prevTop1) {
            isRecord = true;
            title = "Nouveau record absolu d'affluence en vocal";
            description = `Le rassemblement qui vient de s'achever dans #${gathering.channelName} a battu le record historique du serveur ! L'ancienne marque de ${prevTop1} personnes en simultané a été dépassée.`;
        } else if (prevTop1 >= 3 && gathering.peakCount === prevTop1) {
            isRecord = true;
            title = "Record absolu d'affluence égalisé";
            description = `Le rassemblement dans #${gathering.channelName} a réuni ${gathering.peakCount} personnes en même temps, égalant le record historique du serveur !`;
        } else if (prevTop3 >= 3 && gathering.peakCount >= prevTop3) {
            isRecord = true;
            title = "Nouveau rassemblement dans le Top 3 historique";
            description = `Avec un pic de ${gathering.peakCount} personnes en simultané dans #${gathering.channelName}, ce rassemblement intègre le Top 3 des plus grandes affluences historiques du serveur !`;
        }

        if (!isRecord) {
            return;
        }

        const peakTimestampSec = Math.floor(gathering.peakTime / 1000);
        const MAX_SHOWN_USERS = 20;
        const shownUsers = gathering.peakMembers.slice(0, MAX_SHOWN_USERS);
        const remainingCount = gathering.peakMembers.length - shownUsers.length;

        let usersText = shownUsers.map((u) => `<@${u.userId}>`).join(", ");
        if (remainingCount > 0) {
            usersText += ` et ${remainingCount} autre${remainingCount > 1 ? "s" : ""}`;
        }

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setColor("#F1C40F")
            .setDescription(description)
            .addFields(
                {
                    name: "Statistiques du rassemblement",
                    value:
                        `- **Pic atteint :** ${gathering.peakCount} personnes en simultané${prevTop1 > 0 && gathering.peakCount > prevTop1 ? ` (ancien record : ${prevTop1})` : ""}\n` +
                        `- **Heure du pic :** <t:${peakTimestampSec}:f> (<t:${peakTimestampSec}:R>)\n` +
                        `- **Durée du rassemblement :** \`${formatDurationStandard(durationSec)}\``,
                    inline: false,
                },
                {
                    name: `Membres présents au pic (${gathering.peakCount})`,
                    value: usersText,
                    inline: false,
                },
            )
            .setFooter({ text: "DVSB • Statistiques Vocales" })
            .setTimestamp();

        await statsChannel.send({ embeds: [embed] }).catch(() => null);
        logger.info(
            `[PEAK RECORD] Annonce envoyée pour #${gathering.channelName} (${gathering.peakCount} personnes).`,
        );
    } catch (err) {
        logger.error(
            "Erreur lors de l'annonce du record de rassemblement vocal :",
            err,
        );
    }
}

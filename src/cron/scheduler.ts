import db from "../database/db";
import logger from "../utils/logger";
import config from "../config";
import { EmbedBuilder, Client, TextChannel } from "discord.js";
import { formatDurationDetailed, formatDurationStandard } from "../utils/formatters";
import { voiceSessions, leaderboardSnapshots, state } from "../database/schema";
import { sql, eq, desc, and } from "drizzle-orm";
import { getYearlyLeaderboard, getYearlyServerOverview } from "../utils/timeQueries";
import { getPeakGatherings } from "../utils/peakQueries";

interface DBLeaderboardRow {
    userId: string;
    userName: string;
    totalSec: number;
}

interface DBSnapshotRow {
    userId: string;
    rank: number;
}

export function startCronTasks(client: Client): void {
    logger.info("Planificateur de tâches démarré (Bilan + Snapshots + Gazette Annuelle).");

    setInterval(async () => {
        try {
            const now = new Date();

            const parisHour = parseInt(
                now.toLocaleTimeString("fr-FR", {
                    timeZone: config.timezone,
                    hour: "2-digit",
                    hour12: false,
                }),
            );
            const parisDateStr = now.toLocaleDateString("fr-CA", {
                timeZone: config.timezone,
            });
            const parisDay = parseInt(
                now.toLocaleDateString("fr-FR", {
                    timeZone: config.timezone,
                    day: "numeric",
                }),
            );
            const parisMonth = parseInt(
                now.toLocaleDateString("fr-FR", {
                    timeZone: config.timezone,
                    month: "numeric",
                }),
            );
            const parisDayOfWeek = now.toLocaleDateString("fr-FR", {
                timeZone: config.timezone,
                weekday: "short",
            });

            if (parisMonth === 1 && parisDay === 1 && parisHour === 12) {
                const finishedYear = now.getFullYear() - 1;
                const annualKey = `annual_report_${finishedYear}`;
                const alreadySent = db
                    .select()
                    .from(state)
                    .where(eq(state.key, annualKey))
                    .get();
                if (!alreadySent) {
                    db.insert(state).values({ key: annualKey, value: "sent" }).run();
                    await sendAnnualReport(client, finishedYear);
                }
            }

            if (parisMonth === 12 && parisDay >= 1 && parisDay <= 7 && parisDayOfWeek === "sam" && parisHour === 10) {
                const year = now.getFullYear();
                const wrappedKey = `wrapped_unlock_announcement_${year}`;
                const alreadySent = db
                    .select()
                    .from(state)
                    .where(eq(state.key, wrappedKey))
                    .get();
                if (!alreadySent) {
                    db.insert(state).values({ key: wrappedKey, value: "sent" }).run();
                    await sendWrappedUnlockAnnouncement(client, year);
                }
            }

            if (parisDay === 1 && parisHour === 12) {
                const key = `monthly_report_${now.getFullYear()}_${now.getMonth() + 1}`;
                const alreadySent = db
                    .select()
                    .from(state)
                    .where(eq(state.key, key))
                    .get();
                if (!alreadySent) {
                    db.insert(state).values({ key, value: "sent" }).run();
                    await sendMonthlyReport(client);
                }
            }

            if (parisDayOfWeek === "lun" && parisHour === 4) {
                const weekKey = `weekly_snapshot_${parisDateStr}`;
                const alreadySnapped = db
                    .select()
                    .from(state)
                    .where(eq(state.key, weekKey))
                    .get();
                if (!alreadySnapped) {
                    db.insert(state)
                        .values({ key: weekKey, value: "sent" })
                        .run();
                    takeSnapshot(parisDateStr, "weekly");
                }
            }

            if (parisDay === 1 && parisHour === 4) {
                const monthKey = `monthly_snapshot_${parisDateStr}`;
                const alreadySnapped = db
                    .select()
                    .from(state)
                    .where(eq(state.key, monthKey))
                    .get();
                if (!alreadySnapped) {
                    db.insert(state)
                        .values({ key: monthKey, value: "sent" })
                        .run();
                    takeSnapshot(parisDateStr, "monthly");
                }
            }
        } catch (err) {
            logger.error(
                "Erreur critique dans le planificateur de tâches",
                err,
            );
        }
    }, 60000);
}

function takeSnapshot(dateStr: string, periodType: "weekly" | "monthly"): void {
    try {
        const leaderboard = db
            .select({
                userId: voiceSessions.userId,
                userName: voiceSessions.userName,
                totalSec: sql<number>`SUM(${voiceSessions.durationSec})`,
            })
            .from(voiceSessions)
            .groupBy(voiceSessions.userId)
            .orderBy(sql`SUM(${voiceSessions.durationSec}) DESC`)
            .all() as DBLeaderboardRow[];

        db.transaction(() => {
            leaderboard.forEach((user, index) => {
                db.insert(leaderboardSnapshots)
                    .values({
                        snapshotDate: dateStr,
                        periodType,
                        userId: user.userId,
                        userName: user.userName,
                        rank: index + 1,
                        totalTime: user.totalSec,
                    })
                    .run();
            });
        });

        logger.info(
            `Snapshot ${periodType} enregistré avec succès pour la date : ${dateStr}`,
        );
    } catch (err) {
        logger.error("Erreur lors de la capture de snapshot", err);
    }
}

async function sendToStatsAndGeneral(
    client: Client,
    embed: EmbedBuilder,
): Promise<void> {
    const targets = [
        { id: config.statsChannelId, mention: false },
        { id: config.generalChannelId, mention: true },
        { id: config.announcementChannelId, mention: true },
    ];

    for (const target of targets) {
        if (!target.id) {
            continue;
        }
        try {
            const channel = (await client.channels
                .fetch(target.id)
                .catch(() => null)) as TextChannel | null;
            if (channel) {
                await channel.send({
                    content: target.mention ? "@everyone" : undefined,
                    embeds: [embed],
                });
            }
        } catch (err) {
            logger.error(`Erreur lors de l'envoi du message dans le salon ${target.id} :`, err);
        }
    }
}

async function sendAnnualReport(client: Client, year: number): Promise<void> {
    const leaderboard = getYearlyLeaderboard(year);
    if (leaderboard.length === 0) {
        return;
    }

    const yearStr = String(year);
    const overview = getYearlyServerOverview(year);
    const top10 = leaderboard.slice(0, 10);
    const top3 = leaderboard.slice(0, 3);

    const topChannels = db
        .select({
            channelName: voiceSessions.channelName,
            totalSec: sql<number>`SUM(${voiceSessions.durationSec})`,
        })
        .from(voiceSessions)
        .where(sql`strftime('%Y', ${voiceSessions.joinTime}) = ${yearStr}`)
        .groupBy(voiceSessions.channelName)
        .orderBy(sql`SUM(${voiceSessions.durationSec}) DESC`)
        .limit(3)
        .all() as { channelName: string; totalSec: number }[];

    const nightOwl = db
        .select({
            userId: voiceSessions.userId,
            userName: voiceSessions.userName,
            totalSec: sql<number>`SUM(${voiceSessions.durationSec})`,
        })
        .from(voiceSessions)
        .where(
            and(
                sql`strftime('%Y', ${voiceSessions.joinTime}) = ${yearStr}`,
                sql`strftime('%H', datetime(${voiceSessions.joinTime}, '+2 hours')) >= '00' AND strftime('%H', datetime(${voiceSessions.joinTime}, '+2 hours')) < '06'`,
            ),
        )
        .groupBy(voiceSessions.userId)
        .orderBy(sql`SUM(${voiceSessions.durationSec}) DESC`)
        .limit(1)
        .get() as { userId: string; userName: string; totalSec: number } | undefined;

    const longestSession = db
        .select({
            userId: voiceSessions.userId,
            userName: voiceSessions.userName,
            durationSec: voiceSessions.durationSec,
            channelName: voiceSessions.channelName,
            joinTime: voiceSessions.joinTime,
        })
        .from(voiceSessions)
        .where(sql`strftime('%Y', ${voiceSessions.joinTime}) = ${yearStr}`)
        .orderBy(sql`${voiceSessions.durationSec} DESC`)
        .limit(1)
        .get() as {
        userId: string;
        userName: string;
        durationSec: number;
        channelName: string;
        joinTime: string;
    } | undefined;

    const aloneKing = db
        .select({
            userId: sql<string>`user_id`,
            userName: sql<string>`user_name`,
            totalSec: sql<number>`SUM(total_sec)`,
        })
        .from(
            sql`(
                WITH sessions_with_lead_lag AS (
                    SELECT id, user_id, user_name, channel_name, strftime('%s', join_time) as join_epoch, strftime('%s', leave_time) as leave_epoch
                    FROM voice_sessions
                    WHERE strftime('%Y', join_time) = ${yearStr}
                ),
                intervals AS (
                    SELECT s1.user_id, s1.user_name, s1.join_epoch, s1.leave_epoch,
                        (SELECT MIN(s2.join_epoch) FROM sessions_with_lead_lag s2 WHERE s2.channel_name = s1.channel_name AND s2.user_id != s1.user_id AND s2.join_epoch < s1.leave_epoch AND s2.leave_epoch > s1.join_epoch) as overlap_start
                    FROM sessions_with_lead_lag s1
                ),
                alone_durations AS (
                    SELECT user_id, user_name, CASE WHEN overlap_start IS NULL THEN (leave_epoch - join_epoch) ELSE 0 END as alone_sec FROM intervals
                )
                SELECT user_id, user_name, SUM(alone_sec) as total_sec FROM alone_durations GROUP BY user_id
            )`,
        )
        .groupBy(sql`user_id`)
        .orderBy(sql`total_sec DESC`)
        .limit(1)
        .get() as { userId: string; userName: string; totalSec: number } | undefined;

    const topDuo = db
        .select({
            user1Id: sql<string>`s1.user_id`,
            user2Id: sql<string>`s2.user_id`,
            sharedSec: sql<number>`SUM(
                MIN(strftime('%s', s1.leave_time), strftime('%s', s2.leave_time)) -
                MAX(strftime('%s', s1.join_time), strftime('%s', s2.join_time))
            )`,
        })
        .from(sql`voice_sessions s1`)
        .innerJoin(
            sql`voice_sessions s2`,
            sql`s1.channel_name = s2.channel_name 
                AND s1.user_id < s2.user_id 
                AND strftime('%Y', s1.join_time) = ${yearStr} 
                AND strftime('%Y', s2.join_time) = ${yearStr}
                AND s1.join_time < s2.leave_time 
                AND s1.leave_time > s2.join_time`,
        )
        .groupBy(sql`s1.user_id, s2.user_id`)
        .orderBy(sql`sharedSec DESC`)
        .limit(1)
        .get() as { user1Id: string; user2Id: string; sharedSec: number } | undefined;

    const topTrio = db
        .select({
            user1Id: sql<string>`s1.user_id`,
            user2Id: sql<string>`s2.user_id`,
            user3Id: sql<string>`s3.user_id`,
            sharedSec: sql<number>`SUM(
                MIN(strftime('%s', s1.leave_time), strftime('%s', s2.leave_time), strftime('%s', s3.leave_time)) -
                MAX(strftime('%s', s1.join_time), strftime('%s', s2.join_time), strftime('%s', s3.join_time))
            )`,
        })
        .from(sql`voice_sessions s1`)
        .innerJoin(
            sql`voice_sessions s2`,
            sql`s1.channel_name = s2.channel_name 
                AND s1.user_id < s2.user_id 
                AND strftime('%Y', s1.join_time) = ${yearStr} 
                AND strftime('%Y', s2.join_time) = ${yearStr}
                AND s1.join_time < s2.leave_time 
                AND s1.leave_time > s2.join_time`,
        )
        .innerJoin(
            sql`voice_sessions s3`,
            sql`s2.channel_name = s3.channel_name 
                AND s2.user_id < s3.user_id 
                AND strftime('%Y', s3.join_time) = ${yearStr}
                AND s1.join_time < s3.leave_time 
                AND s1.leave_time > s3.join_time
                AND s2.join_time < s3.leave_time 
                AND s2.leave_time > s3.join_time`,
        )
        .groupBy(sql`s1.user_id, s2.user_id, s3.user_id`)
        .orderBy(sql`sharedSec DESC`)
        .limit(1)
        .get() as { user1Id: string; user2Id: string; user3Id: string; sharedSec: number } | undefined;

    const peakGatherings = getPeakGatherings({ year, limit: 1 });
    const topPeak = peakGatherings.length > 0 ? peakGatherings[0] : null;

    let topChanList = "";
    topChannels.forEach((ch, idx) => {
        topChanList += `**#${idx + 1}** \`#${ch.channelName}\` : ${formatDurationStandard(ch.totalSec)}\n`;
    });

    const embedDetailed1 = new EmbedBuilder()
        .setTitle(`Grande Gazette Vocale - Bilan Annuel ${year}`)
        .setColor("#F1C40F")
        .setDescription(
            `L'année **${year}** est terminée ! Voici la grande rétrospective communautaire complète de nos salons vocaux :`,
        )
        .addFields([
            {
                name: "Activité Globale du Serveur",
                value:
                    `- **Volume total cumulé :** ${formatDurationDetailed(overview.totalSec)}\n` +
                    `- **Membres uniques ayant participé :** \`${overview.uniqueUsers}\` membres\n` +
                    `- **Nombre total de sessions vocales :** \`${overview.totalSessions}\` sessions\n` +
                    `- **Journée record de l'année :** \`${overview.busiestDay}\``,
                inline: false,
            },
            {
                name: "Top 3 des Salons les plus Squattés",
                value: topChanList || "Aucun salon enregistré",
                inline: false,
            },
        ])
        .setFooter({ text: "DVSB • Bilan Global 1/3" });

    let top10List = "";
    top10.forEach((row, idx) => {
        top10List += `**#${idx + 1}** <@${row.userId}> : ${formatDurationStandard(row.totalSec)}\n`;
    });

    const embedDetailed2 = new EmbedBuilder()
        .setTitle(`Le Panthéon des Bavards - Top 10 ${year}`)
        .setColor("#5865F2")
        .setDescription(
            `Félicitations aux 10 membres ayant passé le plus de temps en vocal au cours de l'année **${year}** :\n\n${top10List}`,
        )
        .setFooter({ text: "DVSB • Classement Annuel 2/3" });

    const peakText = topPeak
        ? `\`${topPeak.peakCount} personnes\` en simultané dans \`#${topPeak.channelName}\` (<t:${Math.floor(topPeak.peakTime / 1000)}:D>)`
        : "Aucun rassemblement notable";

    const longestSessionText = longestSession
        ? `<@${longestSession.userId}> avec \`${formatDurationStandard(longestSession.durationSec)}\` d'une traite dans \`#${longestSession.channelName}\``
        : "Aucune session";

    const nightOwlText = nightOwl
        ? `<@${nightOwl.userId}> avec \`${formatDurationStandard(nightOwl.totalSec)}\` passées entre 00h et 06h`
        : "Aucune donnée";

    const duoText = topDuo
        ? `<@${topDuo.user1Id}> & <@${topDuo.user2Id}> avec \`${formatDurationStandard(topDuo.sharedSec)}\` passées ensemble en vocal`
        : "Aucun duo enregistré";

    const trioText = topTrio
        ? `<@${topTrio.user1Id}>, <@${topTrio.user2Id}> & <@${topTrio.user3Id}> avec \`${formatDurationStandard(topTrio.sharedSec)}\` partagées à trois`
        : "Aucun trio enregistré";

    const aloneKingText = aloneKing
        ? `<@${aloneKing.userId}> avec \`${formatDurationStandard(aloneKing.totalSec)}\` passé seul en salon`
        : "Aucune donnée";

    const embedDetailed3 = new EmbedBuilder()
        .setTitle(`Faits Marquants & Records de l'Année ${year}`)
        .setColor("#EB459E")
        .addFields([
            {
                name: "Plus Grand Rassemblement (/peak)",
                value: peakText,
                inline: false,
            },
            {
                name: "Le Duo Inséparable de l'Année",
                value: duoText,
                inline: false,
            },
            {
                name: "Le Trio Légendaire de l'Année",
                value: trioText,
                inline: false,
            },
            {
                name: "Session Individuelle Marathon",
                value: longestSessionText,
                inline: false,
            },
            {
                name: "L'Insomniaque de l'Année (00h-06h)",
                value: nightOwlText,
                inline: false,
            },
            {
                name: "Le Plus Grand Solitaire",
                value: aloneKingText,
                inline: false,
            },
            {
                name: "À vos micros !",
                value:
                    "Explorez vos propres statistiques de l'année avec `/wrapped` et `/stats` !\n" +
                    `Bonne année **${year + 1}** à toutes et à tous !`,
                inline: false,
            },
        ])
        .setFooter({ text: `DVSB • Bonne année ${year + 1} !` })
        .setTimestamp();

    const detailedEmbeds = [embedDetailed1, embedDetailed2, embedDetailed3];

    let podiumText = "";
    top3.forEach((row, idx) => {
        podiumText += `**#${idx + 1}** <@${row.userId}> : ${formatDurationStandard(row.totalSec)}\n`;
    });

    const targetRedirectRef = config.announcementChannelId
        ? `<#${config.announcementChannelId}>`
        : config.statsChannelId
          ? `<#${config.statsChannelId}>`
          : "le salon des annonces";

    const embedGeneralTeaser = new EmbedBuilder()
        .setTitle(`Grande Gazette Vocale - Bilan Annuel ${year}`)
        .setColor("#F1C40F")
        .setDescription(
            `L'année **${year}** est terminée ! Voici la grande rétrospective de nos salons vocaux :`,
        )
        .addFields([
            {
                name: "Les Chiffres Clés de l'Année",
                value:
                    `• Volume total cumulé : **${formatDurationStandard(overview.totalSec)}**\n` +
                    `• Membres ayant participé : \`${overview.uniqueUsers}\` membres\n` +
                    `• Salon le plus poncé : **#${overview.topChannel}**\n` +
                    `• Journée record : \`${overview.busiestDay}\``,
                inline: false,
            },
            {
                name: `Le Podium de l'Année ${year}`,
                value: podiumText || "Aucun participant",
                inline: false,
            },
            {
                name: "Rapport Complet & Records",
                value:
                    `Le bilan intégral avec le **Top 10**, le **Duo inséparable**, le **Trio légendaire**, le **plus grand rassemblement**, le **marathonien** et l'**insomniaque de l'année** est disponible dans ${targetRedirectRef} !\n\n` +
                    "N'hésitez pas à générer votre propre rétrospective avec `/wrapped` !",
                inline: false,
            },
        ])
        .setFooter({ text: `DVSB • Bonne année ${year + 1} !` })
        .setTimestamp();

    if (config.statsChannelId) {
        try {
            const statsChan = (await client.channels
                .fetch(config.statsChannelId)
                .catch(() => null)) as TextChannel | null;
            if (statsChan) {
                await statsChan.send({ embeds: detailedEmbeds });
            }
        } catch (err) {
            logger.error("Erreur lors de l'envoi de la gazette dans stats :", err);
        }
    }

    if (config.announcementChannelId) {
        try {
            const annChan = (await client.channels
                .fetch(config.announcementChannelId)
                .catch(() => null)) as TextChannel | null;
            if (annChan) {
                await annChan.send({
                    content: "@everyone",
                    embeds: detailedEmbeds,
                });
            }
        } catch (err) {
            logger.error("Erreur lors de l'envoi de la gazette dans annonces :", err);
        }
    }

    if (config.generalChannelId) {
        try {
            const genChan = (await client.channels
                .fetch(config.generalChannelId)
                .catch(() => null)) as TextChannel | null;
            if (genChan) {
                await genChan.send({
                    content: "@everyone",
                    embeds: [embedGeneralTeaser],
                });
            }
        } catch (err) {
            logger.error("Erreur lors de l'envoi de la gazette dans général :", err);
        }
    }
}

async function sendWrappedUnlockAnnouncement(
    client: Client,
    year: number,
): Promise<void> {
    const embed = new EmbedBuilder()
        .setTitle(`Rétrospective Vocale - Ouverture du Wrapped ${year}`)
        .setColor("#F1C40F")
        .setDescription(
            `Le grand jour est arrivé ! Les statistiques et rétrospectives de l'année **${year}** sont désormais officiellement déverrouillées sur le serveur.\n\n` +
                "- **Consulte ton bilan personnel :** tape `/wrapped`\n" +
                `- **Découvre le classement annuel :** tape \`/annual leaderboard annee:${year}\`\n` +
                `- **Explore le bilan global du serveur :** tape \`/annual server annee:${year}\`\n\n` +
                `Attention : l'année ${year} n'est pas encore terminée ! Le mois de décembre comptera pleinement dans vos statistiques. Le récapitulatif officiel et définitif de **${year}** sera publié ici même le **1er janvier ${year + 1}**.\n\n` +
                "En attendant, partage ton Wrapped avec la communauté et découvre avec qui tu as passé le plus de temps en vocal cette année !",
        )
        .setFooter({ text: "DVSB • Rétrospective Annuelle" })
        .setTimestamp();

    await sendToStatsAndGeneral(client, embed);
}

async function sendMonthlyReport(client: Client): Promise<void> {
    if (!config.statsChannelId) {
        return;
    }
    const channel = (await client.channels
        .fetch(config.statsChannelId)
        .catch(() => null)) as TextChannel | null;
    if (!channel) {
        return;
    }

    const now = new Date();
    const lastMonthNum = now.getMonth() === 0 ? 12 : now.getMonth();
    const yearOfLastMonth =
        now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    const lastMonthString = `${yearOfLastMonth}-${String(lastMonthNum).padStart(2, "0")}`;

    const monthlyTop = db
        .select({
            userId: voiceSessions.userId,
            userName: voiceSessions.userName,
            totalSec: sql<number>`SUM(${voiceSessions.durationSec})`,
        })
        .from(voiceSessions)
        .where(
            sql`strftime('%Y-%m', ${voiceSessions.joinTime}) = ${lastMonthString}`,
        )
        .groupBy(voiceSessions.userId)
        .orderBy(sql`SUM(${voiceSessions.durationSec}) DESC`)
        .limit(5)
        .all() as DBLeaderboardRow[];

    if (monthlyTop.length === 0) {
        return;
    }

    const monthNames = [
        "Janvier",
        "Février",
        "Mars",
        "Avril",
        "Mai",
        "Juin",
        "Juillet",
        "Août",
        "Septembre",
        "Octobre",
        "Novembre",
        "Décembre",
    ];

    const oldSnapshot = db
        .select({
            userId: leaderboardSnapshots.userId,
            rank: leaderboardSnapshots.rank,
        })
        .from(leaderboardSnapshots)
        .where(eq(leaderboardSnapshots.periodType, "monthly"))
        .orderBy(desc(leaderboardSnapshots.id))
        .all() as DBSnapshotRow[];

    const embed = new EmbedBuilder()
        .setTitle(
            `Gazette vocale - bilan de ${monthNames[lastMonthNum - 1].toUpperCase()} ${yearOfLastMonth}`,
        )
        .setColor("#EB459E")
        .setDescription(
            "Le mois s'est achevé ! Voici les plus grands bavards de notre communauté le mois dernier :",
        )
        .setTimestamp();

    let podiumText = "";
    const medals = ["1.", "2.", "3.", "4.", "5."];

    monthlyTop.forEach((row, idx) => {
        let trend = "";
        if (oldSnapshot.length > 0) {
            const match = oldSnapshot.find(
                (snap) => snap.userId === row.userId,
            );
            if (match) {
                const diff = match.rank - (idx + 1);
                if (diff > 0) {
                    trend = ` (+${diff} place${diff > 1 ? "s" : ""})`;
                } else if (diff < 0) {
                    trend = ` (${diff} place${Math.abs(diff) > 1 ? "s" : ""})`;
                } else {
                    trend = " (stable)";
                }
            } else {
                trend = " (nouvelle entrée)";
            }
        }

        podiumText += `${medals[idx]} <@${row.userId}> avec :${trend}\n${formatDurationDetailed(row.totalSec)}\n\n`;
    });

    embed.addFields([{ name: "Top 5 du mois écoulé", value: podiumText }]);
    await channel.send({ embeds: [embed] }).catch(() => null);
}

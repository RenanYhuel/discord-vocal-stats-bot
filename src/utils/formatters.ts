import db from "../database/db";
import { voiceSessions } from "../database/schema";
import { sql } from "drizzle-orm";

interface DBChartDay {
    date: string;
    total_sec: number;
}

export function formatDurationDetailed(seconds: number): string {
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const f1 = `${d}j ${h}h ${m}m ${s}s`;

    const totalHours = Math.floor(seconds / 3600);
    const f2 = `${totalHours}h ${m}m ${s}s`;

    const totalMinutes = Math.floor(seconds / 60);
    const f3 = `${totalMinutes}m ${s}s`;

    const f4 = `${seconds}s`;

    return `${f1}\n↳ *ou ${f2} / ${f3} / ${f4}*`;
}

export function formatDurationStandard(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h}h ${m}m ${s}s`;
}

export function generateWeeklyTextChart(userId: string): string {
    interface DayObj {
        dateStr: string;
        label: string;
        seconds: number;
    }
    const chartDays: DayObj[] = [];
    const now = new Date();

    for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const dateStr = d.toLocaleDateString("fr-CA", {
            timeZone: "Europe/Paris",
        });
        const label = d.toLocaleDateString("fr-FR", {
            weekday: "short",
            timeZone: "Europe/Paris",
        });
        chartDays.push({
            dateStr,
            label,
            seconds: 0,
        });
    }

    const query = db
        .select({
            date: sql<string>`strftime('%Y-%m-%d', datetime(${voiceSessions.joinTime}, '+2 hours'))`,
            total_sec: sql<number>`SUM(${voiceSessions.durationSec})`,
        })
        .from(voiceSessions)
        .where(
            sql`${voiceSessions.userId} = ${userId} AND ${voiceSessions.joinTime} >= ${chartDays[0].dateStr + "T00:00:00.000Z"}`,
        )
        .groupBy(
            sql`strftime('%Y-%m-%d', datetime(${voiceSessions.joinTime}, '+2 hours'))`,
        )
        .all() as DBChartDay[];

    chartDays.forEach((day) => {
        const match = query.find((q) => q.date === day.dateStr);
        if (match) {
            day.seconds = match.total_sec;
        }
    });

    const maxSec = Math.max(...chartDays.map((d) => d.seconds));

    const chartLines: string[] = [];
    chartDays.forEach((day) => {
        let barLength = 0;
        if (maxSec > 0 && day.seconds > 0) {
            barLength = Math.round((day.seconds / maxSec) * 12);
        }

        const barStr = "█".repeat(barLength) + "░".repeat(12 - barLength);
        const hours = (day.seconds / 3600).toFixed(1);

        const cleanLabel =
            day.label.charAt(0).toUpperCase() + day.label.slice(1);
        chartLines.push(`\`${cleanLabel.padEnd(4)} | ${barStr} | ${hours}h\``);
    });

    return chartLines.join("\n");
}

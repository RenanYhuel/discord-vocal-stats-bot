import db from "../database/db";
import config from "../config";
import { aiQuotas } from "../database/schema";
import { eq, and, sql } from "drizzle-orm";

export interface QuotaStatus {
    allowed: boolean;
    remaining: number;
    total: number | null;
    isUnlimited: boolean;
}

function getTodayParisDate(): string {
    return new Date().toLocaleDateString("fr-CA", {
        timeZone: config.timezone,
    });
}

export function checkAiQuota(userId: string, roleIds: string[]): QuotaStatus {
    if (userId === config.adminId) {
        return {
            allowed: true,
            remaining: 999,
            total: null,
            isUnlimited: true,
        };
    }

    if (config.aiVipRoleId && roleIds.includes(config.aiVipRoleId)) {
        return {
            allowed: true,
            remaining: 999,
            total: null,
            isUnlimited: true,
        };
    }

    const todayStr = getTodayParisDate();
    const row = db
        .select({
            usedCount: aiQuotas.usedCount,
        })
        .from(aiQuotas)
        .where(and(eq(aiQuotas.userId, userId), eq(aiQuotas.dateStr, todayStr)))
        .get();

    const used = row ? row.usedCount : 0;
    const remaining = Math.max(0, config.aiDailyQuota - used);

    return {
        allowed: remaining > 0,
        remaining,
        total: config.aiDailyQuota,
        isUnlimited: false,
    };
}

export function consumeAiQuota(userId: string, roleIds: string[]): void {
    if (userId === config.adminId) {
        return;
    }

    if (config.aiVipRoleId && roleIds.includes(config.aiVipRoleId)) {
        return;
    }

    const todayStr = getTodayParisDate();

    db.insert(aiQuotas)
        .values({
            userId,
            dateStr: todayStr,
            usedCount: 1,
        })
        .onConflictDoUpdate({
            target: [aiQuotas.userId, aiQuotas.dateStr],
            set: {
                usedCount: sql`${aiQuotas.usedCount} + 1`,
            },
        })
        .run();
}

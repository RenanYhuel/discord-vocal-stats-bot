import dotenv from "dotenv";
dotenv.config();

const requiredEnv = [
    "TOKEN",
    "CLIENT_ID",
    "GUILD_ID",
    "LOG_CHANNEL_ID",
    "STATS_ID",
    "ADMIN_ID",
];

for (const envVar of requiredEnv) {
    if (!process.env[envVar]) {
        throw new Error(
            `Erreur de configuration : la variable d'environnement ${envVar} est manquante.`,
        );
    }
}

export interface BotConfig {
    token: string;
    clientId: string;
    guildId: string;
    carlLogChannelId: string;
    statsChannelId: string;
    adminId: string;
    timezone: string;
    enableCarlCatchup: boolean;
    geminiApiKey: string | null;
    geminiModel: string;
    aiVipRoleId: string | null;
    aiDailyQuota: number;
}

const config: BotConfig = {
    token: process.env.TOKEN!,
    clientId: process.env.CLIENT_ID!,
    guildId: process.env.GUILD_ID!,
    carlLogChannelId: process.env.LOG_CHANNEL_ID!,
    statsChannelId: process.env.STATS_ID!,
    adminId: process.env.ADMIN_ID!,
    timezone: "Europe/Paris",
    enableCarlCatchup: process.env.ENABLE_CARL_CATCHUP === "true",
    geminiApiKey: process.env.GEMINI_API_KEY || null,
    geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    aiVipRoleId: process.env.AI_VIP_ROLE_ID || null,
    aiDailyQuota: parseInt(process.env.AI_DAILY_QUOTA || "5", 10),
};

export default config;

import dotenv from "dotenv";
dotenv.config();

export interface BotConfig {
    token: string;
    clientId: string;
    guildId: string;
    carlLogChannelId: string;
    statsChannelId: string;
    adminId: string;
    timezone: string;
}

const config: BotConfig = {
    token: process.env.TOKEN || "",
    clientId: process.env.CLIENT_ID || "",
    guildId: process.env.GUILD_ID || "",
    carlLogChannelId: process.env.LOG_CHANNEL_ID || "",
    statsChannelId: process.env.STATS_ID || "",
    adminId: process.env.ADMIN_ID || "",
    timezone: "Europe/Paris",
};

export default config;

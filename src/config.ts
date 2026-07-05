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
            `Erreur de configuration : la variable d'environnement ${envVar} est manquante.`
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
}

const config: BotConfig = {
    token: process.env.TOKEN!,
    clientId: process.env.CLIENT_ID!,
    guildId: process.env.GUILD_ID!,
    carlLogChannelId: process.env.LOG_CHANNEL_ID!,
    statsChannelId: process.env.STATS_ID!,
    adminId: process.env.ADMIN_ID!,
    timezone: "Europe/Paris",
};

export default config;

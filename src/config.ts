import dotenv from "dotenv";
dotenv.config();

export interface BotConfig {
  token: string;
  clientId: string;
  guildId: string;
  carlLogChannelId: string;
  statsChannelId: string;
  adminId: string;
  revealStartDate: Date;
  timezone: string;
}

const config: BotConfig = {
  token: process.env.TOKEN || process.env.DISCORD_TOKEN || "",
  clientId: process.env.CLIENT_ID || "1520385160514764960",
  guildId: process.env.GUILD_ID || "",
  carlLogChannelId: process.env.LOG_CHANNEL_ID || process.env.CARL_LOG_CHANNEL_ID || "",
  statsChannelId: process.env.STATS_ID || "",
  adminId: "767365180593537025",
  revealStartDate: new Date("2026-06-27T16:00:00+02:00"),
  timezone: "Europe/Paris"
};

export default config;

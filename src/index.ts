import { Client, GatewayIntentBits, Partials } from "discord.js";
import config from "./config";
import { initSchema } from "./database/bootstrap";
import { loadCommands } from "./handlers/commandHandler";
import { loadEvents } from "./handlers/eventHandler";
import { runHistoricalAchievementsSync } from "./scripts/syncAchievements";

initSchema();

if (process.argv.includes("--sync-achievements")) {
    runHistoricalAchievementsSync();
    process.exit(0);
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Message, Partials.Channel],
});

loadCommands(client);
loadEvents(client);

client.login(config.token);

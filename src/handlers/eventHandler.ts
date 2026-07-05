import fs from "fs";
import path from "path";
import logger from "../utils/logger";

export interface EventModule {
    name?: string;
    once?: boolean;
    execute: (...args: any[]) => Promise<void> | void;
}

export function loadEvents(client: any): void {
    const eventsPath = path.join(__dirname, "../events");

    if (!fs.existsSync(eventsPath)) {
        logger.warn("Dossier d'événements introuvable.");
        return;
    }

    const eventFiles = fs
        .readdirSync(eventsPath)
        .filter((file) => file.endsWith(".ts") || file.endsWith(".js"));

    for (const file of eventFiles) {
        const filePath = path.join(eventsPath, file);
        const eventRaw = require(filePath);
        const event = eventRaw.default || eventRaw;
        const eventName = file.split(".")[0];

        if (event && typeof event.execute === "function") {
            if (event.once) {
                client.once(event.name || eventName, (...args: any[]) =>
                    event.execute(...args, client),
                );
            } else {
                client.on(event.name || eventName, (...args: any[]) =>
                    event.execute(...args, client),
                );
            }
            logger.info(`Événement Discord lié : ${event.name || eventName}`);
        }
    }
}

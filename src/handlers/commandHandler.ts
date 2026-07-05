import fs from "fs";
import path from "path";
import { Collection, REST, Routes } from "discord.js";
import config from "../config";
import logger from "../utils/logger";

export interface CommandModule {
    data: {
        name: string;
        toJSON: () => unknown;
    };
    execute: (interaction: any, client: any) => Promise<unknown> | unknown;
}

export function loadCommands(client: any): void {
    client.commands = new Collection<string, CommandModule>();
    const commandsPath = path.join(__dirname, "../commands");

    if (!fs.existsSync(commandsPath)) {
        logger.warn("Dossier de commandes introuvable.");
        return;
    }

    const commandFiles = fs
        .readdirSync(commandsPath)
        .filter((file) => file.endsWith(".ts") || file.endsWith(".js"));
    const commandsData: unknown[] = [];

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        const cmdModule = command.default || command;

        if (cmdModule && "data" in cmdModule && "execute" in cmdModule) {
            client.commands.set(cmdModule.data.name, cmdModule);
            commandsData.push(cmdModule.data.toJSON());
            logger.info(`Commande Slash chargée : /${cmdModule.data.name}`);
        } else {
            logger.warn(
                `La commande à ${filePath} manque de propriétés requises.`,
            );
        }
    }

    const rest = new REST({ version: "10" }).setToken(config.token);

    (async () => {
        try {
            logger.info(
                "Enregistrement des commandes Slash auprès de l'API Discord...",
            );
            await rest.put(
                Routes.applicationGuildCommands(
                    config.clientId,
                    config.guildId,
                ),
                { body: commandsData },
            );
            logger.info(
                "Commandes Slash enregistrées avec succès auprès de Discord !",
            );
        } catch (error) {
            logger.error(
                "Erreur lors de l'enregistrement des commandes Slash",
                error,
            );
        }
    })();
}

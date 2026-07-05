import config from "../config";
import db from "../database/db";
import { Message } from "discord.js";
import { state } from "../database/schema";

export default {
    name: "messageCreate",
    async execute(message: Message): Promise<void> {
        if (message.channelId !== config.carlLogChannelId) {
            return;
        }

        db.insert(state)
            .values({
                key: "last_message_id",
                value: message.id,
            })
            .onConflictDoUpdate({
                target: state.key,
                set: { value: message.id },
            })
            .run();
    },
};

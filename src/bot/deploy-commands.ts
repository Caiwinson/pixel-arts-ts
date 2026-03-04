import { REST, Routes } from "discord.js";
import { createCommandData as createCommand } from "./commands/create.js";
import { recreateCommandData as recreateCommand } from "./commands/recreate.js";
import { DISCORD_TOKEN } from "../constants.js";
import { application } from "./bot.js";
import { helpCommandData, voteCommandData, inviteCommandData } from "./commands/meta.js";

const commands = [
    createCommand.toJSON(),
    recreateCommand.toJSON(),
    helpCommandData.toJSON(),
    voteCommandData.toJSON(),
    inviteCommandData.toJSON(),
];

const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN!);

export async function refreshCommands() {
    try {
        console.log("⏳ Refreshing / commands...");
        const application_id = application.id;
        if (!application_id) return;
        await rest.put(Routes.applicationCommands(application_id!), {
            body: commands,
        });
        console.log("✅ / commands reloaded!");
    } catch (error) {
        console.error(error);
    }
}

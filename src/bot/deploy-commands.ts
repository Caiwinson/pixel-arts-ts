import { REST, Routes } from "discord.js";
import { data as createCommand } from "./commands/create.js";
import { DISCORD_TOKEN } from "./constants.js";

const commands = [createCommand.toJSON()];

const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN!);

export async function refreshCommands(application_id: string) {
    try {
        console.log("⏳ Refreshing / commands...");
        await rest.put(Routes.applicationCommands(application_id!), {
            body: commands,
        });
        console.log("✅ / commands reloaded!");
    } catch (error) {
        console.error(error);
    }
}

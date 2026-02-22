import "dotenv/config";
import { REST, Routes } from "discord.js";
import { data as createCommand } from "./commands/create.js";

const commands = [createCommand.toJSON()];

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN!);

(async () => {
    try {
        console.log("⏳ Refreshing / commands...");
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID!),
            { body: commands }
        );
        console.log("✅ / commands reloaded!");
    } catch (error) {
        console.error(error);
    }
})();
import { Events } from "discord.js";
import type { Interaction } from "discord.js";

export default {
    name: Events.InteractionCreate,
    async execute(interaction: Interaction) {
        if (!interaction.isChatInputCommand()) return;

        if (interaction.commandName === "create" && interaction.options.getSubcommand()==="canvas") {
            const { execute } = await import("../commands/create.js");
            await execute(interaction);
        }
    }
};
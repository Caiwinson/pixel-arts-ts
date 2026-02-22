import { Events } from "discord.js";
import type { Interaction } from "discord.js";

export default {
    name: Events.InteractionCreate,
    async execute(interaction: Interaction) {
        if (interaction.isChatInputCommand()) {
            if (
                interaction.commandName === "create" &&
                interaction.options.getSubcommand() === "canvas"
            ) {
                const { execute } = await import("../commands/create.js");
                await execute(interaction);
            }
        }
        else if (interaction.isButton()) {
            const customId = interaction.customId;
            const id = customId.split(":")[0];

            if (id === "pb") {
                const { PixelButtonExecute } = await import("../ui/basic.js");
                await PixelButtonExecute(interaction);
            }
        }
    },
};

import { Events } from "discord.js";
import type { Interaction } from "discord.js";

export default {
    name: Events.InteractionCreate,
    async execute(interaction: Interaction) {
        try {
            if (interaction.isChatInputCommand()) {
                if (
                    interaction.commandName === "create" &&
                    interaction.options.getSubcommand() === "canvas"
                ) {
                    const { createCommandExecute } =
                        await import("./commands/create.js");
                    await createCommandExecute(interaction);
                }
            } else if (interaction.isButton()) {
                const customId = interaction.customId;
                const id = customId.split(":")[0];

                if (id === "pb") {
                    const { pixelButtonExecute: PixelButtonExecute } =
                        await import("./ui/basic.js");
                    await PixelButtonExecute(interaction);
                } else if (id === "ud") {
                    const { undoCanvasExecute } = await import("./ui/meta.js");
                    await undoCanvasExecute(interaction);
                }
            } else if (interaction.isStringSelectMenu()) {
                const customId = interaction.customId;
                const id = customId.split(":")[0];

                if (id === "cc") {
                    const { customColourExecute } =
                        await import("./ui/colour.js");
                    await customColourExecute(interaction);
                }
            }
        } catch (error: any) {
            console.error("Interaction error:", error);

            if (error.code === 10062) return; // Unknown interaction

            if (interaction.isRepliable()) {
                if (interaction.replied || interaction.deferred) {
                    await interaction
                        .followUp({
                            content: "Something went wrong.",
                            ephemeral: true,
                        })
                        .catch(() => {});
                } else {
                    await interaction
                        .reply({
                            content: "Something went wrong.",
                            ephemeral: true,
                        })
                        .catch(() => {});
                }
            }
        }
    },
};

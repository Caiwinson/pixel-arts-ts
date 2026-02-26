import { Events, type Interaction, type ChatInputCommandInteraction, type ButtonInteraction, type StringSelectMenuInteraction } from "discord.js";

import { createCommandExecute } from "./commands/create.js";
import { pixelButtonExecute } from "./ui/basic.js";
import { closeExecute, undoCanvasExecute } from "./ui/meta.js";
import { customColourExecute } from "./ui/colour.js";
import { downloadButtonExecute, timelapseButtonExecute } from "./ui/closed.js";

// Dispatch maps
const buttonHandlers: Record<string, (i: ButtonInteraction) => Promise<void>> = {
    pb: pixelButtonExecute as (i: ButtonInteraction) => Promise<void>,
    cl: closeExecute as (i: ButtonInteraction) => Promise<void>,
    ud: undoCanvasExecute as (i: ButtonInteraction) => Promise<void>,
    download: downloadButtonExecute as (i: ButtonInteraction) => Promise<void>,
    timelapse: timelapseButtonExecute as (i: ButtonInteraction) => Promise<void>,
};

const selectHandlers: Record<string, (i: StringSelectMenuInteraction) => Promise<void>> = {
    cc: customColourExecute as (i: StringSelectMenuInteraction) => Promise<void>,
};

const commandHandlers: Record<string, (i: ChatInputCommandInteraction) => Promise<void>> = {
    "create": createCommandExecute as (i: ChatInputCommandInteraction) => Promise<void>,
};

export default {
    name: Events.InteractionCreate,

    async execute(interaction: Interaction) {
        try {
            // Chat input commands
            if (interaction.isChatInputCommand()) {
                const key = interaction.commandName;
                const handler = commandHandlers[key];
                if (handler) await handler(interaction);
                return;
            }

            // Buttons
            if (interaction.isButton()) {
                const id = interaction.customId.split(":")[0]!;
                const handler = buttonHandlers[id];
                if (handler) await handler(interaction);
                return;
            }

            // Select menus
            if (interaction.isStringSelectMenu()) {
                const id = interaction.customId.split(":")[0]!;
                const handler = selectHandlers[id];
                if (handler) await handler(interaction);
                return;
            }

        } catch (error: any) {
            console.error("Interaction error:", error);

            if (error.code === 10062) return;

            if (!interaction.isRepliable()) return;

            const reply = {
                content: "Something went wrong.",
                ephemeral: true,
            };

            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(reply).catch(() => {});
            } else {
                await interaction.reply(reply).catch(() => {});
            }
        }
    },
};
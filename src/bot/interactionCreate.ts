import {
    Events,
    type Interaction,
    type ChatInputCommandInteraction,
    type ButtonInteraction,
    type StringSelectMenuInteraction,
    MessageFlags,
} from "discord.js";

import { createCommandExecute } from "./commands/create.js";
import { pixelExecute } from "./ui/canvas/basic.js";
import { closeExecute, undoCanvasExecute } from "./ui/canvas/meta.js";
import { colourMenuExecute } from "./ui/interactions/colour.js";
import {
    downloadButtonExecute,
    timelapseButtonExecute,
    timelapseSelectExecute,
} from "./ui/interactions/closed.js";
import {
    placePixelExecute,
    rowOptionsExecute,
    toggleToolExecute,
} from "./ui/canvas/advance.js";
import { toolExecute } from "./ui/interactions/tools.js";
import { recreateCommandExecute } from "./commands/recreate.js";
import {
    helpCommandExecute,
    inviteCommandExecute,
    voteCommandExecute,
} from "./commands/meta.js";
import { handleLegacyInteraction } from "./legacyHandler.js";

// Dispatch maps
const buttonHandlers: Record<string, (i: ButtonInteraction) => Promise<void>> =
    {
        pb: pixelExecute as (i: ButtonInteraction) => Promise<void>,
        cl: closeExecute as (i: ButtonInteraction) => Promise<void>,
        ud: undoCanvasExecute as (i: ButtonInteraction) => Promise<void>,
        download: downloadButtonExecute as (
            i: ButtonInteraction,
        ) => Promise<void>,
        timelapse: timelapseButtonExecute as (
            i: ButtonInteraction,
        ) => Promise<void>,
        place: placePixelExecute as (i: ButtonInteraction) => Promise<void>,
        tt: toggleToolExecute as (i: ButtonInteraction) => Promise<void>,
    };

const selectHandlers: Record<
    string,
    (i: StringSelectMenuInteraction) => Promise<void>
> = {
    cc: colourMenuExecute as (i: StringSelectMenuInteraction) => Promise<void>,
    ts: timelapseSelectExecute as (
        i: StringSelectMenuInteraction,
    ) => Promise<void>,
    sel: rowOptionsExecute as (i: StringSelectMenuInteraction) => Promise<void>,
    tool: toolExecute as (i: StringSelectMenuInteraction) => Promise<void>,
};

const commandHandlers: Record<
    string,
    (i: ChatInputCommandInteraction) => Promise<void>
> = {
    create: createCommandExecute as (
        i: ChatInputCommandInteraction,
    ) => Promise<void>,
    recreate: recreateCommandExecute as (
        i: ChatInputCommandInteraction,
    ) => Promise<void>,
    help: helpCommandExecute as (
        i: ChatInputCommandInteraction,
    ) => Promise<void>,
    vote: voteCommandExecute as (
        i: ChatInputCommandInteraction,
    ) => Promise<void>,
    invite: inviteCommandExecute as (
        i: ChatInputCommandInteraction,
    ) => Promise<void>,
};

export default {
    name: Events.InteractionCreate,

    async execute(interaction: Interaction) {
        if (await handleLegacyInteraction(interaction)) return;
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

            if (interaction.replied || interaction.deferred) {
                await interaction
                    .followUp({
                        content: "Something went wrong.",
                        flags: MessageFlags.Ephemeral,
                    })
                    .catch(() => {});
            } else {
                await interaction
                    .reply({
                        content: "Something went wrong.",
                        flags: MessageFlags.Ephemeral,
                    })
                    .catch(() => {});
            }
        }
    },
};

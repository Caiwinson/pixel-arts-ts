import {
    ActionRow,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    StringSelectMenuInteraction,
    StringSelectMenuOptionBuilder,
} from "discord.js";
import { createColourPicker } from "./colour.js";

type PixelSelection = {
    x: number;
    y: number;
};

type MessageCanvasState = {
    [userId: string]: PixelSelection; // each user's selected pixel
};

type AdvanceCanvasState = {
    [messageId: string]: MessageCanvasState; // all users for a message
};

const advanceCanvasState: AdvanceCanvasState = {};

function createRowOptions(
    type: "x" | "y",
    size: number,
    default_num: number = 1,
) {
    const options: StringSelectMenuOptionBuilder[] = [];
    const emoji = type === "x" ? "🇽" : "🇾";
    for (let i = 1; i <= size; i++) {
        options.push(
            new StringSelectMenuOptionBuilder()
                .setLabel(i.toString())
                .setValue(i.toString())
                .setEmoji(emoji)
                .setDefault(default_num === i),
        );
    }
    return options;
}

export async function createAdvanceView(
    size: number,
    defaultX: number = 1,
    defaultY: number = 1,
    defaultHex: string,
    extra_colours: string[] = [],
) {
    // X SELECT MENU
    const xMenu = new StringSelectMenuBuilder()
        .setCustomId("sel:x")
        .addOptions(createRowOptions("x", size, defaultX));

    const xRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        xMenu,
    );

    // Y SELECT MENU
    const yMenu = new StringSelectMenuBuilder()
        .setCustomId("sel:y")
        .addOptions(createRowOptions("y", size, defaultY));

    const yRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        yMenu,
    );

    const cMenu = await createColourPicker(
        defaultHex,
        "advanced",
        extra_colours,
    );

    const cRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        cMenu,
    );

    const bRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId("place")
            .setLabel("Place Pixel")
            .setStyle(ButtonStyle.Primary),
    );

    return [xRow, yRow, cRow, bRow];
}

export async function rowOptionsExecute(
    interaction: StringSelectMenuInteraction,
) {
    const type = interaction.customId.split(":")[1];
    const msgId = interaction.message.id;
    const userId = interaction.user.id;

    // Initialize message entry if missing
    if (!advanceCanvasState[msgId]) advanceCanvasState[msgId] = {};

    // Initialize user selection if missing, default x=1, y=1
    if (!advanceCanvasState[msgId][userId]) {
        advanceCanvasState[msgId][userId] = { x: 1, y: 1 };
    }

    const state = advanceCanvasState[msgId][userId];

    // Update the value based on selection
    const selectedValue = interaction.values[0]!;
    const numericValue = parseInt(selectedValue);

    if (type === "x") state.x = numericValue;
    else state.y = numericValue;

    await interaction.deferUpdate();
}

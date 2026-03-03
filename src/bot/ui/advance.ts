import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonInteraction,
    ButtonStyle,
    Message,
    StringSelectMenuBuilder,
    StringSelectMenuInteraction,
    StringSelectMenuOptionBuilder,
} from "discord.js";
import { createColourPickerMenu, getColourList } from "./colour.js";
import {
    createCanvasEmbed,
    ensureOwner,
    getCanvasKey,
    getStringSelectById,
} from "../utils.js";
import {
    recordPixelUpdate,
    getUserColour,
} from "../../database.js";
import { createToolMenu } from "./tools.js";

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

export function getUserSelection(
    messageId: string,
    userId: string,
): PixelSelection {
    // Initialize message entry if missing
    if (!advanceCanvasState[messageId]) {
        advanceCanvasState[messageId] = {};
    }

    // Initialize user selection if missing, default x=1, y=1
    if (!advanceCanvasState[messageId][userId]) {
        advanceCanvasState[messageId][userId] = { x: 1, y: 1 };
    }

    return advanceCanvasState[messageId][userId];
}

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
    showsTool: boolean = true,
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

    const cMenu = await createColourPickerMenu(
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

        new ButtonBuilder()
            .setCustomId("cl:advanced")
            .setLabel("Close")
            .setEmoji("❌")
            .setStyle(ButtonStyle.Danger),

        new ButtonBuilder()
            .setCustomId("ud:advanced")
            .setLabel("Undo")
            .setEmoji("↩️")
            .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
            .setCustomId("tt")
            .setLabel("Toggle Tool")
            .setEmoji("🔧")
            .setStyle(ButtonStyle.Secondary),
    );

    const tMenu = createToolMenu(showsTool);

    const tRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        tMenu,
    );

    return [xRow, yRow, cRow, bRow, tRow];
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

export async function parseCanvasState(messageId: Message) {
    // Safely get URL from embed
    const url = messageId.embeds?.[0]?.image?.url;
    if (!url) return null; // no image, abort

    // Extract key from URL
    const key = await getCanvasKey(url);
    const size = Math.sqrt(key.length / 6);

    // Determine if ?plot=True is in the URL
    const showsPlot = url.includes("?plot=True");

    // Return structured state
    return { key, size, showsPlot };
}

export async function placePixelExecute(interaction: ButtonInteraction) {
    const canvasState = await parseCanvasState(interaction.message);
    if (!canvasState) return;

    const { key: keyStr, size, showsPlot } = canvasState;
    if (!size) return;

    const selection = getUserSelection(
        interaction.message.id,
        interaction.user.id,
    );

    const x = selection.x - 1;
    const y = selection.y - 1;

    const colour = await getUserColour(interaction.user.id);
    const num = y * size + x;

    const colourMenu = getStringSelectById(interaction.message, "cc:advanced");

    if (!colourMenu) return;

    const colourList = getColourList(colourMenu);

    const toolsEnabled = !getStringSelectById(interaction.message, "tool")
        ?.disabled;

    const newKey =
        keyStr.slice(0, num * 6) + colour + keyStr.slice(num * 6 + 6);

    const embeds = await createCanvasEmbed(newKey, showsPlot);

    await interaction.update({
        embeds: [embeds],
        components: await createAdvanceView(
            size,
            selection.x,
            selection.y,
            colour,
            colourList,
            toolsEnabled,
        ),
    });

    await recordPixelUpdate(
        interaction.message.id,
        newKey,
        `${num}:${colour}`,
        interaction.user.id,
    );
}

export async function toggleToolExecute(interaction: ButtonInteraction) {
    const allowed = ensureOwner(
        interaction,
        interaction.message,
        "You cannot toggle tools on this canvas.",
    );
    if (!allowed) return;

    const toolMenu = getStringSelectById(interaction.message, "tool");
    const toolsEnabled = toolMenu?.disabled;

    const selection = getUserSelection(
        interaction.message.id,
        interaction.user.id,
    );

    const size = getStringSelectById(interaction.message, "sel:x")?.options
        .length!;

    const colourList = getColourList(
        getStringSelectById(interaction.message, "cc:advanced")!,
    );

    const colour = await getUserColour(interaction.user.id);

    await interaction.update({
        components: await createAdvanceView(
            size,
            selection.x,
            selection.y,
            colour,
            colourList,
            toolsEnabled,
        ),
    });
}

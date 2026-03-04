import {
    ButtonInteraction,
    StringSelectMenuInteraction,
    type Interaction,
} from "discord.js";
import { createClosedView } from "./ui/closed.js";
import { createCanvasView, createColourPickerView } from "./ui/basic.js";
import { createAdvanceView } from "./ui/advance.js";
import { getUserColour } from "../database.js";
import { getCanvasKey, getStringSelectById } from "./utils.js";

// ---- Legacy ID sets ----

const LEGACY_BUTTON_IDS = new Set([
    "Download",
    "Timelapse",
    "S:Close",
    "colour_picker",
    "advance:place",
    "A:Close",
    "A:tools",
]);

const LEGACY_SELECT_IDS = new Set([
    "colours",
    "advance:x",
    "advance:y",
    "A:Tools",
]);

function isLegacyBasicPixelButton(customId: string): boolean {
    // Python basic canvas buttons were just "0"–"24"
    const n = Number(customId);
    return Number.isInteger(n) && n >= 0 && n <= 24;
}

function isLegacyBasicModeButton(customId: string): boolean {
    // Python advanced "basic mode" overlay buttons: "basic_mode:{0-24}"
    return /^basic_mode:\d+$/.test(customId);
}

function isLegacyButton(customId: string): boolean {
    return (
        LEGACY_BUTTON_IDS.has(customId) ||
        isLegacyBasicPixelButton(customId) ||
        isLegacyBasicModeButton(customId)
    );
}

function isLegacySelect(customId: string): boolean {
    return LEGACY_SELECT_IDS.has(customId);
}

// ---- Canvas type detection ----

type CanvasViewType = "closed" | "colourPicker" | "basic" | "advanced";

function detectViewType(
    interaction: ButtonInteraction | StringSelectMenuInteraction,
): CanvasViewType {
    const msg = interaction.message;

    // Advanced canvas always has an "advance:x" select
    if (getStringSelectById(msg, "advance:x")) return "advanced";

    // Colour picker reply has a "colours" select
    if (getStringSelectById(msg, "colours")) return "colourPicker";

    // Closed canvas is triggered by Download / Timelapse buttons
    const id = interaction.customId;
    if (id === "Download" || id === "Timelapse") return "closed";

    return "basic";
}

// ---- View rebuilders ----

async function rebuildClosedView(
    interaction: ButtonInteraction | StringSelectMenuInteraction,
): Promise<void> {
    await interaction.message.edit({
        components: createClosedView(),
    });
}

async function rebuildBasicView(
    interaction: ButtonInteraction | StringSelectMenuInteraction,
): Promise<void> {
    await interaction.message.edit({
        components: createCanvasView(),
    });
}

async function rebuildColourPickerView(
    interaction: ButtonInteraction | StringSelectMenuInteraction,
): Promise<void> {
    const defaultHex = await getUserColour(interaction.user.id);
    await interaction.message.edit({
        components: await createColourPickerView(defaultHex),
    });
}

async function rebuildAdvancedView(
    interaction: ButtonInteraction | StringSelectMenuInteraction,
): Promise<void> {
    const url = interaction.message.embeds?.[0]?.image?.url;
    if (!url) return;

    const key = await getCanvasKey(url);
    const size = Math.round(Math.sqrt(key.length / 6));
    const defaultHex = await getUserColour(interaction.user.id);

    await interaction.message.edit({
        components: await createAdvanceView(size, 1, 1, defaultHex, [], true),
    });
}

// ---- Public handler ----

/**
 * Returns true if the interaction was a legacy Python view and has been
 * migrated. The caller should stop processing the interaction immediately.
 */
export async function handleLegacyInteraction(
    interaction: Interaction,
): Promise<boolean> {
    if (!interaction.isButton() && !interaction.isStringSelectMenu()) {
        return false;
    }

    const customId = interaction.customId;
    const isLegacy = isLegacyButton(customId) || isLegacySelect(customId);

    if (!isLegacy) return false;

    // Acknowledge immediately so Discord doesn't show "interaction failed"
    await interaction.deferUpdate().catch(() => {});

    try {
        const viewType = detectViewType(interaction);

        switch (viewType) {
            case "closed":
                await rebuildClosedView(interaction);
                break;
            case "colourPicker":
                await rebuildColourPickerView(interaction);
                break;
            case "advanced":
                await rebuildAdvancedView(interaction);
                break;
            case "basic":
            default:
                await rebuildBasicView(interaction);
                break;
        }
    } catch (err) {
        console.error("Failed to migrate legacy view:", err);
    }

    return true;
}

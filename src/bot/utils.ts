import {
    ButtonInteraction,
    ComponentType,
    EmbedBuilder,
    Message,
    MessageFlags,
    StringSelectMenuComponent,
    StringSelectMenuInteraction,
} from "discord.js";
import { EMBED_COLOUR, DOMAIN_URL } from "../constants.js";
import { getImageHash, postImageHash } from "../database.js";

export function hexToInt(hex: string): number {
    // Remove leading "#" if present
    if (hex.startsWith("#")) hex = hex.slice(1);
    return parseInt(hex, 16);
}

export function createCanvasEmbed(key: string, showPlot = false): EmbedBuilder {
    // Validate key (matches Python logic)
    if (!key || key.length === 0) {
        throw new Error("Invalid key");
    }

    // Python-style integer division first (len(key) // 6)
    const size = Math.floor(Math.sqrt(Math.floor(key.length / 6)));

    const embed = new EmbedBuilder()
        .setTitle("Pixel Arts")
        .setColor(EMBED_COLOUR);

    let url: string;
    if (size === 5 || size === 10 || size === 15) {
        url = `${DOMAIN_URL}/image/${key}.png`;
    } else if (size === 20 || size === 25) {
        const imgHash = postImageHash(key, size);
        url = `${DOMAIN_URL}/image_large/${imgHash}.png`;
    } else {
        throw new Error("Invalid canvas size");
    }

    embed.setImage(url + (showPlot ? "?plot=True" : ""));

    return embed;
}

export function getCanvasKey(url: string): string {
    // Get the last segment after "/", default to empty string if undefined
    const lastSegment = url.split("/").pop() ?? "";

    // Remove query string if present; default to empty string if undefined
    const noQuery = lastSegment.split("?")[0] ?? "";

    // Split on period and take the first part; safe because noQuery is always string
    let key = noQuery.split(".")[0]!;

    if (url.includes("image_large")) {
        key = getImageHash(key)![1];
    }

    return key;
}

export function getStringSelectById(
    message: Message,
    customId: string,
): StringSelectMenuComponent | undefined {
    for (const row of message.components) {
        if (row.type !== ComponentType.ActionRow) continue;

        for (const component of row.components) {
            if (
                component.type === ComponentType.StringSelect &&
                component.customId === customId
            ) {
                return component;
            }
        }
    }

    return undefined;
}

export async function ensureOwner(
    interaction: ButtonInteraction | StringSelectMenuInteraction,
    message: Message,
    denyMessage: string,
): Promise<boolean> {
    // Check if the user who triggered the interaction matches the message's stored user
    if (message.interactionMetadata?.user.id !== interaction.user.id) {
        await interaction.reply({
            content: denyMessage,
            flags: MessageFlags.Ephemeral,
        });
        return false;
    }
    return true;
}

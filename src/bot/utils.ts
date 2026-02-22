import { EmbedBuilder } from "discord.js";
import { EMBED_COLOUR, DOMAIN_URL } from "../constants.js";

export function HexToInt(hex: string): number {
    // Remove leading "#" if present
    if (hex.startsWith("#")) hex = hex.slice(1);
    return parseInt(hex, 16);
}

export function createCanvasEmbed(key: string, showPlot = false): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setTitle("Pixel Arts")
        .setColor(EMBED_COLOUR)
        .setImage(
            `${DOMAIN_URL}/image/${key}.png${showPlot ? "?plot=True" : ""}`,
        );

    return embed;
}

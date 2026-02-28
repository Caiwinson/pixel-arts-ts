import { EmbedBuilder } from "discord.js";
import { EMBED_COLOUR, DOMAIN_URL } from "../constants.js";
import { postImageHash } from "../database.js";

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
        url = `${DOMAIN_URL}/image/${key}.png${size > 5 ? "?plot=True" : ""}`;
    } else if (size === 20 || size === 25) {
        const imgHash = postImageHash(key, size);
        url = `${DOMAIN_URL}/image_large/${imgHash}.png?plot=True`;
    } else {
        throw new Error("Invalid canvas size");
    }

    embed.setImage(url + (showPlot ? "?plot=True" : ""));

    return embed;
}

export function getCanvasKey(url: string): string {
    return url.split("/").pop()?.split(".")[0]!;
}

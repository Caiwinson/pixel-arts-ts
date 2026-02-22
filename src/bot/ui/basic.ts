import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} from "discord.js";

import type { ButtonInteraction} from "discord.js";
import { createCanvasEmbed } from "../utils.js";
import { getDb } from "../../database.js";

// Generate a row of buttons
function createCanvasRow(
    start: number,
    end: number,
): ActionRowBuilder<ButtonBuilder> {
    const row = new ActionRowBuilder<ButtonBuilder>();
    for (let i = start; i < end; i++) {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`pb:${i}`)
                .setLabel("⠀") // invisible space
                .setStyle(ButtonStyle.Secondary), // gray button
        );
    }
    return row;
}

export function createCanvasView(): ActionRowBuilder<ButtonBuilder>[] {
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    let id = 0;

    for (let y = 0; y < 5; y++) {
        // Each row has 5 buttons
        rows.push(createCanvasRow(id, id + 5));
        id += 5;
    }

    return rows;
}

export async function PixelButtonExecute(interaction: ButtonInteraction) {
    const key = interaction.message.embeds[0]!.image!.url
    .replace(".png", "")
    .slice(-150);

    const num = Number(interaction.customId.split(":")[1]) * 6;
    const colour = getDb(interaction.user.id);


    // original python snipper: key = key[:num] + colour + key[num + 6:]
    const newKey = key.slice(0, num) + colour + key.slice(num + 6);
    const embed = createCanvasEmbed(newKey);
    await interaction.update({ embeds: [embed] });
}

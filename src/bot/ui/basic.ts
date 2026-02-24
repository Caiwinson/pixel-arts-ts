import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

import type { ButtonInteraction, StringSelectMenuBuilder } from "discord.js";
import { createCanvasEmbed, getCanvasKey } from "../utils.js";
import { appendPixelUpdate, getUserColour } from "../../database.js";
import { createColourPicker } from "./meta.js";

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
    const url = interaction.message.embeds?.[0]?.image?.url;
    const key = getCanvasKey(url!);

    const num = Number(interaction.customId.split(":")[1]);
    const colour = getUserColour(interaction.user.id);

    const newKey = key.slice(0, num * 6) + colour + key.slice(num * 6 + 6);
    const embed = createCanvasEmbed(newKey);
    await interaction.update({ embeds: [embed] });
    appendPixelUpdate(
        interaction.message.id,
        newKey,
        `${num}:${colour}`,
        interaction.user.id,
    );
}

export async function createColourPickerView(
    defaultHex: string,
    extra_colours: string[] = [],
): Promise<
    [
        ActionRowBuilder<StringSelectMenuBuilder>,
        ActionRowBuilder<ButtonBuilder>
    ]
> {
    const menu = await createColourPicker(defaultHex, "basic", extra_colours);

    const selectRow =
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);

    const buttonRow =
        new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId("cl:basic")
                .setLabel("Close")
                .setEmoji("❌")
                .setStyle(ButtonStyle.Danger),

            new ButtonBuilder()
                .setCustomId("ud:basic")
                .setLabel("Undo")
                .setEmoji("↩️")
                .setStyle(ButtonStyle.Secondary),
        );

    return [selectRow, buttonRow];
}

import {
    StringSelectMenuBuilder,
    StringSelectMenuInteraction,
    StringSelectMenuOptionBuilder,
} from "discord.js";
import { createCanvasEmbed, ensureOwner, getCanvasKey } from "../utils.js";

export function createToolMenu(
    showsTool: boolean = false,
): StringSelectMenuBuilder {
    const options: StringSelectMenuOptionBuilder[] = [
        new StringSelectMenuOptionBuilder()
            .setLabel("Line")
            .setValue("line")
            .setEmoji("✏️"),
        new StringSelectMenuOptionBuilder()
            .setLabel("Rectangle")
            .setValue("rectangle")
            .setEmoji("⬛"),
        new StringSelectMenuOptionBuilder()
            .setLabel("Bucket Fill")
            .setValue("bucket")
            .setEmoji("🪣"),
        new StringSelectMenuOptionBuilder()
            .setLabel("Outline")
            .setValue("outline")
            .setEmoji("🔲"),
        new StringSelectMenuOptionBuilder()
            .setLabel("Replace Colour")
            .setValue("replace")
            .setEmoji("🔄"),
        new StringSelectMenuOptionBuilder()
            .setLabel("Toggle Plot")
            .setValue("plot")
            .setEmoji("🔢"),
    ];

    const menu = new StringSelectMenuBuilder()
        .setCustomId("tool")
        .setPlaceholder("Select a tool")
        .setMinValues(1)
        .setMaxValues(1)
        .setDisabled(!showsTool)
        .addOptions(options);

    return menu;
}

const toolMap: Record<string, any> = {
    // line: LineModal,
    // rectangle: RectangleFillModal,
    // bucket: BucketFillModal,
    // outline: OutlineModal,
    // colour: ColourPickerModal,
    // replace: ReplaceColourModal,
    plot: handlePlot,
};

export async function toolExecute(interaction: StringSelectMenuInteraction) {
    const tool = interaction.values[0]!;
    const handler = toolMap[tool];
    if (handler) await handler(interaction);
}

async function handlePlot(interaction: StringSelectMenuInteraction) {
    const allowed = ensureOwner(
        interaction,
        interaction.message,
        "You cannot toggle plots on this canvas.",
    );
    if (!allowed) return;

    const url = interaction.message.embeds?.[0]?.image?.url;

    const showsPlot = url?.includes("?plot=True") ?? false;

    const key = getCanvasKey(url!);

    await interaction.update({
        embeds: [createCanvasEmbed(key, !showsPlot)],
    });
}

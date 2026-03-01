import { StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from "discord.js";

export function createToolMenu(showsTool: boolean = false): StringSelectMenuBuilder {
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
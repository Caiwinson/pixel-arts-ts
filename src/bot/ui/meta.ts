import {
    StringSelectMenuBuilder,
    StringSelectMenuInteraction,
    StringSelectMenuOptionBuilder,
} from "discord.js";
import { COLOUR_OPTION } from "../../constants.js";
import { postUserColour } from "../../database.js";

const colourNameCache = new Map<string, string>();

async function getColourName(hex: string): Promise<string> {
    const clean = hex.replace("#", "").toLowerCase();

    if (colourNameCache.has(clean)) {
        return colourNameCache.get(clean)!;
    }

    try {
        const res = await fetch(`https://www.thecolorapi.com/id?hex=${clean}`);

        const data = await res.json();

        const name = data?.name?.value ?? `#${clean.toUpperCase()}`;

        colourNameCache.set(clean, name);

        return name;
    } catch {
        const fallback = `#${clean.toUpperCase()}`;

        colourNameCache.set(clean, fallback);

        return fallback;
    }
}

export async function createColourPicker(
    defaultHex: string,
    uiType: string = "basic",
    extra_colours: string[] = [],
) {
    const options: StringSelectMenuOptionBuilder[] = [];
    const used = new Set<string>();

    const defaultClean = defaultHex.replace("#", "").toLowerCase();

    async function addColour(
        hexRaw: string,
        emoji?: string,
        labelOverride?: string,
    ) {
        const clean = hexRaw.replace("#", "").toLowerCase();

        if (used.has(clean)) return;

        used.add(clean);

        const label = labelOverride ?? (await getColourName(clean));

        const option = new StringSelectMenuOptionBuilder()
            .setLabel(label)
            .setValue(clean)
            .setDescription(`#${clean.toUpperCase()}`)
            .setDefault(clean === defaultClean);

        if (emoji) option.setEmoji(emoji);

        options.push(option);
    }

    // preset colours (USE GIVEN NAME)
    for (const [key, item] of Object.entries(COLOUR_OPTION)) {
        const formatted = key
            .split("-")
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" ");

        await addColour(
            item.hex,
            item.emoji,
            formatted, // override label
        );
    }

    // extra colours (USE API)
    for (const hex of extra_colours) {
        await addColour(hex);
    }

    // inject default if missing
    if (!used.has(defaultClean)) {
        await addColour(defaultClean);
    }

    const MAX_COLOURS = 24; // excluding "custom"

    // Trim extra colours if exceeding limit
    // Preserve preset colours and default
    while (options.length > MAX_COLOURS) {
        // find first removable option
        const index = options.findIndex((option) => {
            const value = option.data.value;
            if (!value) return false;
            const clean = value.toLowerCase();

            const isPreset = Object.values(COLOUR_OPTION).some(
                (c) => c.hex.toLowerCase() === clean,
            );
            const isDefault = clean === defaultClean;

            return !isPreset && !isDefault;
        });

        if (index === -1) break;

        const [removed] = options.splice(index, 1);
        if (removed?.data.value) used.delete(removed.data.value);
    }

    // custom option
    options.push(
        new StringSelectMenuOptionBuilder()
            .setLabel("Custom Colour")
            .setValue("custom")
            .setDescription("Enter a custom hex")
            .setEmoji("<:rgb:1048826497089146941>"),
    );

    return new StringSelectMenuBuilder()
        .setCustomId("cc:" + uiType)
        .setPlaceholder("Select a Colour")
        .addOptions(options);
}

export async function CustomColourExecute(
    interaction: StringSelectMenuInteraction,
) {
    const value = interaction.values[0]!;
    //if not custom
    if (value !== "custom") {
        postUserColour(interaction.user.id, value);
        // defer
        await interaction.deferUpdate();
    }
}

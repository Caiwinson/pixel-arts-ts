import {
    ActionRowBuilder,
    LabelBuilder,
    MessageFlags,
    ModalBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuComponent,
    StringSelectMenuInteraction,
    StringSelectMenuOptionBuilder,
    TextInputBuilder,
    TextInputStyle,
    type APIStringSelectComponent,
    type TopLevelComponent,
} from "discord.js";
import { COLOUR_OPTION } from "../../constants.js";
import { postUserColour } from "../../database.js";
import { createColourPickerView } from "./basic.js";

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
    uiType: "basic" | "advanced" = "basic",
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
function getColourList(
    component: StringSelectMenuComponent | APIStringSelectComponent,
): string[] {
    const options = "options" in component ? component.options : [];
    const allColours: string[] = [];

    for (const option of options) {
        const value = option.value?.toLowerCase();
        if (!value) continue;
        if (value === "custom") break;
        allColours.push(value);
    }

    const presetHexes = Object.values(COLOUR_OPTION).map((c) =>
        c.hex.toLowerCase(),
    );
    const startIndex = allColours.findIndex(
        (hex) => !presetHexes.includes(hex),
    );
    if (startIndex === -1) return [];
    return allColours.slice(startIndex);
}

export async function CustomColourExecute(
    interaction: StringSelectMenuInteraction,
) {
    const value = interaction.values[0]!;
    if (value === "custom") {
        const id = Math.floor(Math.random() * 1000000);
        const modal = createColourModal(id);
        await interaction.showModal(modal);
        const uiTypeRaw = interaction.customId.split(":")[1];
        const uiType: "basic" | "advanced" =
            uiTypeRaw === "basic" || uiTypeRaw === "advanced"
                ? uiTypeRaw
                : "basic";

        try {
            const submitted = await interaction.awaitModalSubmit({
                filter: (i) =>
                    i.user.id === interaction.user.id &&
                    i.customId === `cm:${id}`,
                time: 60_000,
            });

            const hexInput = submitted.fields.getTextInputValue("hex_input");

            if (!/^([0-9A-Fa-f]{6})$/.test(hexInput)) {
                await submitted.reply({
                    content:
                        "Invalid HEX code. Please enter 6 hexadecimal characters.",
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }
            await submitted.deferUpdate();

            const hexColour = hexInput.toLowerCase();
            postUserColour(interaction.user.id, hexColour);

            const component = interaction.component;
            const colourList = getColourList(component);

            if (uiType === "basic") {
                await submitted.message?.edit({
                    components: [
                        await createColourPickerView(hexColour, colourList),
                    ],
                });
            }
        } catch {
            // Only reply on timeout using the modal submit interaction
            await interaction.followUp({
                content: "You did not submit a colour in time.",
                flags: MessageFlags.Ephemeral,
            });
        }
    } else {
        postUserColour(interaction.user.id, value);
        await interaction.deferUpdate();
    }
}

export function createColourModal(id: number) {
    // Create the modal
    const modal = new ModalBuilder()
        .setCustomId(`cm:${id}`)
        .setTitle("Custom Colour");

    // Create the text input
    const hexInput = new TextInputBuilder()
        .setCustomId("hex_input")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("ffffff")
        .setRequired(true)
        .setMinLength(6)
        .setMaxLength(6);

    // Wrap the text input with a label
    const hexLabel = new LabelBuilder()
        .setLabel("HEX code of your Colour")
        .setTextInputComponent(hexInput);

    // Add the labeled component to the modal
    modal.addLabelComponents(hexLabel);

    return modal;
}

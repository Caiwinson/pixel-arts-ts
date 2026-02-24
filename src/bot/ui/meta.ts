import {
    ButtonInteraction,
    Emoji,
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
} from "discord.js";
import { COLOUR_OPTION } from "../../constants.js";
import { postUserColour, undoPixelUpdate } from "../../database.js";
import { createColourPickerView } from "./basic.js";
import { createCanvas } from "@napi-rs/canvas";
import { application } from "../bot.js";
import { createCanvasEmbed } from "../utils.js";

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
const MAX_EMOJIS = 2000;
const EmojiCache = new Map<string, string>();

export async function initEmojiCache() {
    const emojis = await application.emojis.fetch();

    emojis.forEach((emoji: Emoji) => {
        if (emoji.name) {
            EmojiCache.set(emoji.name, emoji.toString());
        }
    });
}

async function getEmoji(hex: string) {
    if (EmojiCache.has(hex)) {
        return EmojiCache.get(hex)!;
    }

    // Ensure space before creating
    await ensureEmojiCapacity();

    const emojiString = await createEmoji(hex);
    EmojiCache.set(hex, emojiString);

    return emojiString;
}

async function ensureEmojiCapacity() {
    if (EmojiCache.size < MAX_EMOJIS) return;

    const oldestKey = EmojiCache.keys().next().value;

    if (!oldestKey) return;

    const oldestEmojiString = EmojiCache.get(oldestKey);

    if (!oldestEmojiString) return;

    const match = oldestEmojiString.match(/:(\d+)>$/);

    if (!match) return;

    const emojiId = match[1];

    if (!emojiId) return;

    await application.emojis.delete(emojiId);

    EmojiCache.delete(oldestKey);
}

async function createEmoji(colour: string) {
    const size = 96;
    const radius = 12;
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext("2d");

    if (!/^([0-9A-Fa-f]{6})$/.test(colour)) {
        throw new Error("Colour must be 6-character hex");
    }

    ctx.fillStyle = `#${colour}`;

    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.lineTo(size - radius, 0);
    ctx.quadraticCurveTo(size, 0, size, radius);
    ctx.lineTo(size, size - radius);
    ctx.quadraticCurveTo(size, size, size - radius, size);
    ctx.lineTo(radius, size);
    ctx.quadraticCurveTo(0, size, 0, size - radius);
    ctx.lineTo(0, radius);
    ctx.quadraticCurveTo(0, 0, radius, 0);
    ctx.closePath();
    ctx.fill();

    const buffer = canvas.toBuffer("image/png");

    const emoji = await application.emojis.create({
        attachment: buffer,
        name: colour,
    });

    return emoji.toString();
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
        await addColour(hex, await getEmoji(hex));
    }

    // inject default if missing
    if (!used.has(defaultClean)) {
        await addColour(defaultClean, await getEmoji(defaultClean));
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
        let hasSubmitted = false;

        try {
            const submitted = await interaction.awaitModalSubmit({
                filter: (i) =>
                    i.user.id === interaction.user.id &&
                    i.customId === `cm:${id}`,
                time: 60_000,
            });
            hasSubmitted = true;

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
                    components: await createColourPickerView(
                        hexColour,
                        colourList,
                    ),
                });
            }
        } catch {
            // Only reply on timeout using the modal submit interaction
            if (hasSubmitted) {
                await interaction.followUp({
                    content: "You did not submit a colour in time.",
                    flags: MessageFlags.Ephemeral,
                });
            }
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

const RATE_LIMIT = 3;
const RATE_WINDOW = 60 * 1000; // 1 minute in ms

// userId -> timestamps
const undoRateLimit = new Map<string, number[]>();

function isRateLimited(userId: string): boolean {
    const now = Date.now();

    const timestamps = undoRateLimit.get(userId) || [];

    // keep only timestamps inside window
    const valid = timestamps.filter((ts) => now - ts < RATE_WINDOW);

    if (valid.length >= RATE_LIMIT) {
        undoRateLimit.set(userId, valid);
        return true;
    }

    valid.push(now);
    undoRateLimit.set(userId, valid);

    return false;
}

export async function undoCanvasExecute(interaction: ButtonInteraction) {
    const mode = interaction.customId.split(":")[1];
    // RATE LIMIT CHECK
    if (isRateLimited(interaction.user.id)) {
        await interaction.reply({
            content:
                "Rate limit exceeded. You can only undo 3 times per minute.",
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    if (mode === "basic") {
        const message = await interaction.message.fetchReference();

        if (!message) {
            await interaction.reply({
                content:
                    "No canvas found. It may have been deleted or is no longer available.",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        if (message.interactionMetadata?.user.id !== interaction.user.id) {
            await interaction.reply({
                content: "You cannot undo this action.",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const key = undoPixelUpdate(message.id);

        if (!key) {
            await interaction.reply({
                content: "No changes to undo.",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        await interaction.deferUpdate();

        const embed = createCanvasEmbed(key);

        await message.edit({ embeds: [embed] });
    }
}

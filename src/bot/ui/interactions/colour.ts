// src/bot/ui/colour.ts
import { createCanvas } from "@napi-rs/canvas";
import {
    Collection,
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
    type Emoji,
} from "discord.js";

import { application } from "../../bot.js";
import { COLOUR_OPTION } from "../../../constants.js";
import {
    setUserColour,
    getEmojiByHex,
    upsertEmojiRecord,
    deleteEmojiRecord,
    getEmojiCount,
    getOldestNonPresetEmoji,
} from "../../../database.js";
import { createBasicColourView } from "../canvas/basic.js";
import {
    createAdvanceCanvasView,
    getUserSelection,
} from "../canvas/advance.js";
import { checkVote, getStringSelectById } from "../../utils.js";

/* ------------------------------------------------ */
/*                    CONSTANTS                     */
/* ------------------------------------------------ */

const MAX_EMOJIS = 2000;
const EMOJI_CREATE_DELAY = 300;

/* ------------------------------------------------ */
/*                PRECOMPUTED DATA                  */
/* ------------------------------------------------ */

const presetHexSet = new Set(
    Object.values(COLOUR_OPTION).map((c) => cleanHex(c.hex)),
);

/* ------------------------------------------------ */
/*                UTILITY FUNCTIONS                 */
/* ------------------------------------------------ */

function cleanHex(hex: string): string {
    return hex.startsWith("#") ? hex.slice(1).toLowerCase() : hex.toLowerCase();
}

function parseEmojiId(emojiString: string): string | null {
    const match = emojiString.match(/<:[^:]+:(\d+)>/);
    return match?.[1] ?? null;
}

/* ------------------------------------------------ */
/*                COLOUR NAME CACHE                */
/* ------------------------------------------------ */

const colourNameCache = new Map<string, string>();
const pendingColourName = new Map<string, Promise<string>>();

export async function getColourName(hex: string): Promise<string> {
    const clean = cleanHex(hex);

    if (colourNameCache.has(clean)) {
        const value = colourNameCache.get(clean)!;
        refreshLRU(colourNameCache, clean, value);
        return value;
    }

    if (pendingColourName.has(clean)) return pendingColourName.get(clean)!;

    const promise = (async () => {
        try {
            const res = await fetch(
                `https://www.thecolorapi.com/id?hex=${clean}`,
            );
            const data = await res.json();
            const name = data?.name?.value ?? `#${clean.toUpperCase()}`;
            colourNameCache.set(clean, name);
            return name;
        } catch {
            const fallback = `#${clean.toUpperCase()}`;
            colourNameCache.set(clean, fallback);
            return fallback;
        }
    })();

    pendingColourName.set(clean, promise);
    const result = await promise;
    pendingColourName.delete(clean);
    return result;
}

/* ------------------------------------------------ */
/*                  GET EMOJI                      */
/* ------------------------------------------------ */

const pendingEmoji = new Map<string, Promise<string>>();
const emojiQueue: (() => Promise<void>)[] = [];
let emojiCreating = false;

export async function getEmoji(hex: string): Promise<string> {
    const clean = cleanHex(hex);

    // 1. DB lookup
    const stored = await getEmojiByHex(clean);
    if (stored) return stored;

    // 2. Deduplicate in-flight creation
    if (pendingEmoji.has(clean)) return pendingEmoji.get(clean)!;

    const promise = queueEmojiCreation(clean);
    pendingEmoji.set(clean, promise);

    try {
        return await promise;
    } finally {
        pendingEmoji.delete(clean);
    }
}

/* ------------------------------------------------ */
/*            EMOJI CREATION QUEUE                 */
/* ------------------------------------------------ */

function queueEmojiCreation(hex: string): Promise<string> {
    return new Promise((resolve) => {
        emojiQueue.push(async () => {
            await ensureEmojiCapacity();
            const emoji = await createEmoji(hex);
            const emojiStr = emoji.toString();
            await upsertEmojiRecord(hex, emojiStr);
            resolve(emojiStr);
        });
        processEmojiQueue();
    });
}

async function processEmojiQueue() {
    if (emojiCreating) return;
    emojiCreating = true;

    while (emojiQueue.length) {
        const job = emojiQueue.shift()!;
        try {
            await job();
        } catch (err) {
            console.error("Emoji creation failed:", err);
        }
        await sleep(EMOJI_CREATE_DELAY);
    }

    emojiCreating = false;
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ------------------------------------------------ */
/*             ENSURE EMOJI CAPACITY               */
/* ------------------------------------------------ */

async function ensureEmojiCapacity() {
    const count = await getEmojiCount();
    if (count < MAX_EMOJIS) return;

    const presetHexList = Array.from(presetHexSet);
    const oldest = await getOldestNonPresetEmoji(presetHexList);
    if (!oldest) return;

    const emojiId = parseEmojiId(oldest.emoji_string);
    if (emojiId) {
        try {
            await application.emojis.delete(emojiId);
        } catch (err) {
            console.warn(
                `Failed to delete emoji ${oldest.hex} from Discord: ${err}`,
            );
        }
    }

    await deleteEmojiRecord(oldest.hex);
}

/* ------------------------------------------------ */
/*               CANVAS REUSE SYSTEM               */
/* ------------------------------------------------ */

const canvas = createCanvas(96, 96);
const ctx = canvas.getContext("2d");

async function createEmoji(hex: string): Promise<Emoji> {
    if (!/^[0-9A-Fa-f]{6}$/.test(hex)) throw new Error("Invalid hex");

    ctx.clearRect(0, 0, 96, 96);

    const radius = 12;
    ctx.fillStyle = `#${hex}`;
    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.lineTo(96 - radius, 0);
    ctx.quadraticCurveTo(96, 0, 96, radius);
    ctx.lineTo(96, 96 - radius);
    ctx.quadraticCurveTo(96, 96, 96 - radius, 96);
    ctx.lineTo(radius, 96);
    ctx.quadraticCurveTo(0, 96, 0, 96 - radius);
    ctx.lineTo(0, radius);
    ctx.quadraticCurveTo(0, 0, radius, 0);
    ctx.closePath();
    ctx.fill();

    const buffer = canvas.toBuffer("image/png");
    return application.emojis.create({ attachment: buffer, name: hex });
}

/* ------------------------------------------------ */
/*              COLOUR PICKER CREATION             */
/* ------------------------------------------------ */

export async function createColourMenu(
    defaultHex: string,
    uiType: "basic" | "advanced" | "modal" = "basic",
    extraColours: string[] = [],
) {
    const options: StringSelectMenuOptionBuilder[] = [];
    const used = new Set<string>();
    const defaultClean = cleanHex(defaultHex);

    async function addColour(
        hex: string,
        emoji?: string,
        labelOverride?: string,
    ) {
        const clean = cleanHex(hex);
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

    for (const [key, item] of Object.entries(COLOUR_OPTION)) {
        const label = key
            .split("-")
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" ");
        await addColour(item.hex, item.emoji, label);
    }

    await Promise.all(
        extraColours.map(async (hex) => {
            const emoji = await getEmoji(hex);
            await addColour(hex, emoji);
        }),
    );

    if (!used.has(defaultClean)) {
        const emoji = await getEmoji(defaultClean);
        await addColour(defaultClean, emoji);
    }

    while (options.length > 24) {
        const index = options.findIndex((option) => {
            const value = option.data.value;
            if (!value) return false;
            const clean = value.toLowerCase();
            return !presetHexSet.has(clean) && clean !== defaultClean;
        });

        if (index === -1) break;

        const removed = options.splice(index, 1)[0];
        if (removed?.data.value) used.delete(removed.data.value);
    }

    if (uiType !== "modal") {
        options.push(
            new StringSelectMenuOptionBuilder()
                .setLabel("Custom Colour")
                .setValue("custom")
                .setDescription("Enter a custom hex")
                .setEmoji("<:rgb:1048826497089146941>"),
        );
    }

    return new StringSelectMenuBuilder()
        .setCustomId("cc:" + uiType)
        .setPlaceholder("Select a Colour")
        .addOptions(options);
}

/* ------------------------------------------------ */
/*                GET COLOUR LIST                  */
/* ------------------------------------------------ */

export function getColourList(
    component: StringSelectMenuComponent | APIStringSelectComponent,
): string[] {
    const options = "options" in component ? component.options : [];
    const colours: string[] = [];

    for (const option of options) {
        const value = option.value?.toLowerCase();
        if (!value) continue;
        if (value === "custom") break;
        colours.push(value);
    }

    const start = colours.findIndex((hex) => !presetHexSet.has(hex));
    return start === -1 ? [] : colours.slice(start);
}

/* ------------------------------------------------ */
/*            CUSTOM COLOUR EXECUTION              */
/* ------------------------------------------------ */

export async function colourMenuExecute(
    interaction: StringSelectMenuInteraction,
) {
    const value = interaction.values[0]!;

    if (value !== "custom") {
        await setUserColour(interaction.user.id, value);
        await interaction.deferUpdate();
        return;
    }

    const hasVoted = await checkVote(interaction);
    if (!hasVoted) return;

    const id = Math.floor(Math.random() * 1000000);
    const modal = createColourModal(id);
    await interaction.showModal(modal);

    let submitted;
    try {
        submitted = await interaction.awaitModalSubmit({
            filter: (i) =>
                i.user.id === interaction.user.id && i.customId === `cm:${id}`,
            time: 60000,
        });
    } catch {
        return;
    }

    const hex = submitted.fields.getTextInputValue("hex_input").toLowerCase();

    if (!/^[0-9a-f]{6}$/.test(hex)) {
        await submitted.reply({
            content: "Invalid HEX code",
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    await setUserColour(interaction.user.id, hex);
    await submitted.deferUpdate();

    const list = getColourList(interaction.component);
    const type = interaction.customId.split(":")[1]!;

    if (type === "basic") {
        await submitted.editReply({
            components: await createBasicColourView(hex, list),
        });
    } else {
        const selection = getUserSelection(
            interaction.message.id,
            interaction.user.id,
        );

        const size = getStringSelectById(interaction.message, "sel:x")?.options
            .length!;

        const toolsEnabled = !getStringSelectById(interaction.message, "tool")
            ?.disabled;

        await submitted.editReply({
            components: await createAdvanceCanvasView(
                size,
                selection.x,
                selection.y,
                hex,
                list,
                toolsEnabled,
            ),
        });
    }
}

/* ------------------------------------------------ */
/*                MODAL CREATION                   */
/* ------------------------------------------------ */

export function createColourModal(id: number) {
    const modal = new ModalBuilder()
        .setCustomId(`cm:${id}`)
        .setTitle("Custom Colour");

    const input = new TextInputBuilder()
        .setCustomId("hex_input")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMinLength(6)
        .setMaxLength(6);

    const label = new LabelBuilder()
        .setLabel("HEX code")
        .setTextInputComponent(input);

    modal.addLabelComponents(label);
    return modal;
}

/* ------------------------------------------------ */
/*                 LRU REFRESH                     */
/* ------------------------------------------------ */

function refreshLRU<K, V>(map: Map<K, V>, key: K, value: V) {
    map.delete(key);
    map.set(key, value);
}

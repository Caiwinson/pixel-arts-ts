import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonInteraction,
    ButtonStyle,
    LabelBuilder,
    MessageFlags,
    ModalBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
} from "discord.js";
import { getCanvasHistory, revertLastPixel } from "../../../database.js";
import { createCanvasEmbed, ensureOwner, getCanvasKey } from "../../utils.js";
import { createClosedCanvasView } from "../interactions/closed.js";

async function resolveCanvasMessage(
    interaction: ButtonInteraction,
    uiMode: string,
) {
    if (uiMode !== "basic") {
        return interaction.message;
    }

    const referenceId = interaction.message.reference?.messageId;
    if (!referenceId) {
        await interaction.reply({
            content:
                "No canvas found. It may have been deleted or is no longer available.",
            flags: MessageFlags.Ephemeral,
        });
        return null;
    }

    try {
        // Try channel fetch first, fall back to client fetch for DMs
        const message =
            (await interaction.channel?.messages.fetch({
                message: referenceId,
                force: true,
            })) ??
            (await interaction.client.channels
                .fetch(interaction.channelId!)
                .then((ch) =>
                    ch?.isTextBased() ? ch.messages.fetch(referenceId) : null,
                ));

        if (!message) throw new Error("Message not found");
        return message;
    } catch {
        await interaction.reply({
            content:
                "No canvas found. It may have been deleted or is no longer available.",
            flags: MessageFlags.Ephemeral,
        });
        return null;
    }
}

export function createConfirmCloseModal(id: number) {
    const modal = new ModalBuilder()
        .setCustomId(`clm:${id}`)
        .setTitle("Confirm Close");

    const confirmSelect = new StringSelectMenuBuilder()
        .setCustomId("confirm")
        .setRequired(true)
        .addOptions(
            new StringSelectMenuOptionBuilder().setLabel("Yes").setValue("y"),
            new StringSelectMenuOptionBuilder().setLabel("No").setValue("n"),
        );

    const confirmLabel = new LabelBuilder()
        .setLabel("Are you sure you want to close this canvas?")
        .setDescription("This action cannot be undone.")
        .setStringSelectMenuComponent(confirmSelect);

    modal.addLabelComponents(confirmLabel);

    return modal;
}

async function confirmClose(interaction: ButtonInteraction, id: number) {
    const modal = createConfirmCloseModal(id);
    await interaction.showModal(modal);

    const submitted = await interaction.awaitModalSubmit({
        filter: (i) =>
            i.user.id === interaction.user.id && i.customId === `clm:${id}`,
        time: 60_000,
    });

    await submitted.deferUpdate();

    return submitted.fields.getStringSelectValues("confirm")[0] === "y";
}

export async function closeExecute(interaction: ButtonInteraction) {
    const id = Math.floor(Math.random() * 1_000_000);
    const uiMode = interaction.customId.split(":")[1];

    const message = await resolveCanvasMessage(interaction, uiMode!);
    if (!message) return;

    const allowed = await ensureOwner(
        interaction,
        message,
        "You cannot close this canvas.",
    );
    if (!allowed) return;

    if ((await getCanvasHistory(message.id)).length <= 2) {
        await interaction.reply({
            content: "Not enough changes were made.",
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    let confirmed = false;

    try {
        confirmed = await confirmClose(interaction, id);
    } catch {
        return;
    }

    if (!confirmed) return;

    // MODE-SPECIFIC ACTION
    if (uiMode === "basic") {
        await interaction.message.delete();

        await message.edit({
            content: "Canvas closed.",
            components: createClosedCanvasView(),
        });
    } else {
        const url = message.embeds?.[0]?.image?.url!;

        const key = await getCanvasKey(url);

        const embed = await createCanvasEmbed(key);

        await message.edit({
            content: "Canvas closed.",
            embeds: [embed],
            components: createClosedCanvasView(),
        });
    }
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
    const uiMode = interaction.customId.split(":")[1];

    if (isRateLimited(interaction.user.id)) {
        await interaction.reply({
            content:
                "Rate limit exceeded. You can only undo 3 times per minute.",
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    const message =
        uiMode === "basic"
            ? await resolveCanvasMessage(interaction, uiMode)
            : interaction.message;

    if (!message) return;

    if (message.interactionMetadata?.user.id !== interaction.user.id) {
        await interaction.reply({
            content: "You cannot undo this action.",
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    const key = await revertLastPixel(message.id);

    if (!key) {
        await interaction.reply({
            content: "No changes to undo.",
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    const showsPlot =
        message.embeds?.[0]?.image?.url?.includes("?plot=True") ?? false;

    const embed = await createCanvasEmbed(key, showsPlot);

    if (uiMode === "basic") {
        await interaction.deferUpdate();
        await message.edit({ embeds: [embed] });
    } else {
        await interaction.update({ embeds: [embed] });
    }
}

export function createVoteView(): ActionRowBuilder<ButtonBuilder>[] {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setLabel("Vote on Top.gg")
            .setStyle(ButtonStyle.Link)
            .setURL("https://top.gg/bot/1008692736720908318/vote")
            .setEmoji("<:topgg:1478516915369541893>"),
    );
    return [row];
}

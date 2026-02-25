import {
    ButtonInteraction,
    LabelBuilder,
    MessageFlags,
    ModalBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
} from "discord.js";
import { undoPixelUpdate } from "../../database.js";
import { createCanvasEmbed } from "../utils.js";

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

export async function closeExecute(interaction: ButtonInteraction) {
    const id = Math.floor(Math.random() * 1000000);
    const mode = interaction.customId.split(":")[1];

    if (mode === "basic") {
        let message;

        try {
            message = await interaction.channel?.messages.fetch({
                message: interaction.message.reference?.messageId!,
                force: true,
            })!;
        } catch (error) {
            await interaction.reply({
                content:
                    "No canvas found. It may have been deleted or is no longer available.",
                flags: MessageFlags.Ephemeral,
            });

            return;
        }

        if (message.interactionMetadata?.user.id !== interaction.user.id) {
            await interaction.reply({
                content: "You cannot close this canvas.",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const modal = createConfirmCloseModal(id);
        await interaction.showModal(modal);
        let hasSubmitted = false;

        try {
            const submitted = await interaction.awaitModalSubmit({
                filter: (i) =>
                    i.user.id === interaction.user.id &&
                    i.customId === `clm:${id}`,
                time: 60_000,
            });
            hasSubmitted = true;

            const value = submitted.fields.getStringSelectValues("confirm")[0];
            await submitted.deferUpdate();
            if (value === "y") {
                await interaction.message.delete();

                await message.edit({
                    content: "Canvas closed.",
                    components: [],
                });
            }
        } catch {
            if (hasSubmitted) {
                await interaction.followUp({
                    content: "You did not confirm in time.",
                    flags: MessageFlags.Ephemeral,
                });
            }
        }
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
        let message;

        try {
            message = await interaction.channel?.messages.fetch({
                message: interaction.message.reference?.messageId!,
                force: true,
            })!;
        } catch (error) {
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

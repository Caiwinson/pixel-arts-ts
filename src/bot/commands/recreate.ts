import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    PermissionFlagsBits,
    MessageFlags,
} from "discord.js";

import { createCanvasView, createColourPickerView } from "../ui/basic.js";
import { createAdvanceView } from "../ui/advance.js";
import { createCanvasEmbed } from "../utils.js";

import {
    incrementCanvasCount,
    recordPixelUpdate,
    getUserColour,
} from "../../database.js";

import { createCanvas, loadImage } from "@napi-rs/canvas";

export const recreateCommandData = new SlashCommandBuilder()
    .setName("recreate")
    .setDescription("Recreate an image into an editable canvas")
    .addSubcommand((sub) =>
        sub
            .setName("image")
            .setDescription("Recreate an image into an editable canvas")
            .addAttachmentOption((option) =>
                option
                    .setName("image")
                    .setDescription("The image you wish to recreate")
                    .setRequired(true),
            )
            .addIntegerOption((option) =>
                option
                    .setName("size")
                    .setDescription("The size of the canvas")
                    .setRequired(false)
                    .addChoices(
                        { name: "5x5 (default)", value: 5 },
                        { name: "10x10", value: 10 },
                        { name: "15x15", value: 15 },
                        { name: "20x20 (vote only)", value: 20 },
                        { name: "25x25 (vote only)", value: 25 },
                    ),
            )
            .addBooleanOption((option) =>
                option
                    .setName("enable_tools")
                    .setDescription("Enable or disable tools (15x15 only)")
                    .setRequired(false),
            ),
    );

export async function recreateCommandExecute(
    interaction: ChatInputCommandInteraction,
) {
    // ---------- Permission Check ----------
    if (interaction.inGuild()) {
        const channel = interaction.channel;
        if (!channel) return;

        const permissions = channel.permissionsFor(interaction.client.user!);

        if (
            !permissions?.has([
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.EmbedLinks,
            ])
        ) {
            return interaction.reply({
                content: "I don't have permission to send messages here.",
                flags: MessageFlags.Ephemeral,
            });
        }
    }

    // ---------- Options ----------
    const attachment = interaction.options.getAttachment("image", true);
    const size = interaction.options.getInteger("size") || 5;
    const enableTools = interaction.options.getBoolean("enable_tools") ?? true;

    if (!attachment.contentType?.startsWith("image/")) {
        return interaction.reply({
            content: "Unsupported format. Please upload an image.",
            flags: MessageFlags.Ephemeral,
        });
    }

    // ---------- Voting Requirement ----------
    // const hasVoted = await checkVote(interaction);
    // if (!hasVoted) return;

    // Image processing may take time
    //await interaction.deferReply(wi);

    try {
        // ---------- Fetch Image Manually (more reliable) ----------
        const response = await fetch(attachment.url);

        if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.status}`);
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        const img = await loadImage(buffer);

        // ---------- Canvas Setup ----------
        const canvas = createCanvas(size, size);
        const ctx = canvas.getContext("2d");

        // Prevent alpha blending artifacts
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, size, size);

        // Deterministic smoothing (non-nearest scaling)
        ctx.imageSmoothingEnabled = true;

        ctx.drawImage(img, 0, 0, size, size);

        // ---------- Extract RGB Data ----------
        const imageData = ctx.getImageData(0, 0, size, size).data;

        let key = "";

        for (let i = 0; i < imageData.length; i += 4) {
            const r = imageData[i]!.toString(16).padStart(2, "0");
            const g = imageData[i + 1]!.toString(16).padStart(2, "0");
            const b = imageData[i + 2]!.toString(16).padStart(2, "0");
            key += `${r}${g}${b}`;
        }

        // ---------- UI Creation ----------
        const isAdvance = size > 5;
        const embed = createCanvasEmbed(key, isAdvance);
        const defaultHex = getUserColour(interaction.user.id);

        if (!isAdvance) {
            await interaction.reply({
                content: `${interaction.user} has created a canvas.`,
                embeds: [embed],
                components: createCanvasView(),
                withResponse: true,
            });

            const message = await interaction.fetchReply();

            await message.reply({
                content: "Pick a colour!",
                components: await createColourPickerView(defaultHex),
            });

            recordPixelUpdate(message.id, key, null, interaction.user.id);
            incrementCanvasCount();
        } else {
            await interaction.reply({
                content: `${interaction.user} has created a canvas.`,
                embeds: [embed],
                components: await createAdvanceView(
                    size,
                    1,
                    1,
                    defaultHex,
                    undefined,
                    enableTools,
                ),
            });

            const message = await interaction.fetchReply();

            recordPixelUpdate(message.id, key, null, interaction.user.id);
            incrementCanvasCount();
        }
    } catch (error) {
        console.error("Image processing error:", error);

        await interaction.editReply({
            content: "There was an error processing your image.",
        });
    }
}

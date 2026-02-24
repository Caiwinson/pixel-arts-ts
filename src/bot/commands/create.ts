import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    PermissionFlagsBits,
    MessageFlags,
    ModalSubmitInteraction,
} from "discord.js";
import { createCanvasView, createColourPickerView } from "../ui/basic.js";
import { createCanvasEmbed } from "../utils.js";
import { COLOUR_OPTION } from "../../constants.js";
import {
    appendCanvasCount,
    appendPixelUpdate,
    getUserColour,
} from "../../database.js";
import { createColourModal } from "../ui/meta.js";

const colourChoices = [
    ...Object.entries(COLOUR_OPTION).map(([name, data]) => ({
        name: name, // display name in the slash command
        value: data.hex, // HEX value as the choice value
    })),
    {
        name: "Custom Colour",
        value: "custom", // special value to trigger the modal
    },
];

export const data = new SlashCommandBuilder()
    .setName("create")
    .setDescription("Create something")
    .addSubcommand((sub) =>
        sub
            .setName("canvas")
            .setDescription("Generate a new canvas")
            .addStringOption(
                (option) =>
                    option
                        .setName("colour")
                        .setDescription("Choose a colour")
                        .setRequired(false)
                        .addChoices(...colourChoices), // spread the array here
            )
            .addIntegerOption((option) =>
                option
                    .setName("size")
                    .setDescription("Canvas size")
                    .setRequired(false)
                    .addChoices(
                        { name: "5x5 (default)", value: 5 },
                        { name: "10x10", value: 10 },
                        { name: "15x15", value: 15 },
                        { name: "20x20 (vote only)", value: 20 },
                        { name: "25x25 (vote only)", value: 25 },
                    ),
            ),
    );

export async function execute(
    interaction: ChatInputCommandInteraction | ModalSubmitInteraction,
) {
    if (interaction.isModalSubmit()) {
        return;
    }
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

    let BaseColour = interaction.options.getString("colour") || "ffffff";
    const size = interaction.options.getInteger("size") || 5;

    if (BaseColour === "custom") {
        // id = random number
        const id = Math.floor(Math.random() * 1000000);
        const modal = createColourModal(id);
        await interaction.showModal(modal);
        let hasSubmitted = false;

        try {
            // Wait for the user to submit the modal
            const submitted = await interaction.awaitModalSubmit({
                filter: (i) =>
                    i.user.id === interaction.user.id &&
                    i.customId === `cm:${id}`, // ensure it's the correct modal
                time: 60_000, // wait up to 60 seconds
            });
            hasSubmitted = true;

            const hexInput = submitted.fields.getTextInputValue("hex_input");

            // Basic hex validation
            if (!/^([0-9A-Fa-f]{6})$/.test(hexInput)) {
                await submitted.reply({
                    content:
                        "Invalid HEX code. Please enter 6 hexadecimal characters.",
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            BaseColour = hexInput.toLowerCase();
            interaction = submitted;
        } catch {
            if (hasSubmitted) {
                return interaction.followUp({
                    content: "You did not submit a colour in time.",
                    flags: MessageFlags.Ephemeral,
                });
            }
        }
    }

    const key = BaseColour.repeat(size ** 2);
    const embed = createCanvasEmbed(key);

    await interaction.reply({
        content: `${interaction.user} has created a canvas.`,
        embeds: [embed],
        components: createCanvasView(),
        withResponse: true,
    });

    const message = await interaction.fetchReply();

    await message.reply({
        content: "Pick a colour!",
        components: [
            await createColourPickerView(getUserColour(interaction.user.id)),
        ],
    });

    appendPixelUpdate(message.id, null, key, interaction.user.id);
    appendCanvasCount();
}

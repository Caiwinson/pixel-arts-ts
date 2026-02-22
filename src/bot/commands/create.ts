import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    MessageFlags,
} from "discord.js";
import { createCanvasView } from "../ui/basic.js";
import { createCanvasEmbed } from "../utils.js";
import { COLOUR_OPTION } from "../constants.js";

const colourChoices = Object.entries(COLOUR_OPTION).map(([name, data]) => ({
    name: name, // display name in the slash command
    value: data.hex, // the HEX value as the choice value
}));

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

export async function execute(interaction: ChatInputCommandInteraction) {
    const BaseColour = interaction.options.getString("colour") || "ffffff";
    const size = interaction.options.getInteger("size") || 5;

    const key = BaseColour.repeat(size**2);

    // Create embed using the key
    const embed = createCanvasEmbed(key);
    await interaction.reply({
        content: `<@${interaction.user.id}> has created a canvas.`,
        embeds: [embed],
        components: createCanvasView(),
        flags: MessageFlags.Ephemeral,
    });
}

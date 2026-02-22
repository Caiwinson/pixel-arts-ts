import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    MessageFlags,
    EmbedBuilder,
} from "discord.js";
import { createCanvasView } from "../ui/basic.js";
import { createCanvasEmbed } from "../utils.js";

export const data = new SlashCommandBuilder()
    .setName("create")
    .setDescription("Create something")
    .addSubcommand((sub) =>
        sub.setName("canvas").setDescription("Generate a new canvas"),
    );

export async function execute(interaction: ChatInputCommandInteraction) {
    const key = "ffffff".repeat(25);

    // Create embed using the key
    const embed = createCanvasEmbed(key);
    await interaction.reply({
        content: `<@${interaction.user.id}> has created a canvas.`,
        embeds: [embed as EmbedBuilder],
        components: createCanvasView(),
        flags: MessageFlags.Ephemeral,
    });
}

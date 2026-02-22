import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";

export const data = new SlashCommandBuilder()
    .setName("create")
    .setDescription("Create a new canvas");

export async function execute(interaction: ChatInputCommandInteraction) {
    // Reply to the user
    await interaction.reply({
        content: "🎨 Canvas created! Ready to paint.",
        ephemeral: true
    });
}
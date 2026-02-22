import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  MessageFlags,
} from "discord.js";
import { createCanvasView } from "../ui/basic.js";

export const data = new SlashCommandBuilder()
  .setName("create")
  .setDescription("Create something")
  .addSubcommand((sub) =>
    sub.setName("canvas").setDescription("Generate a new canvas"),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  // Reply to the user
  await interaction.reply({
    content: "🎨 Canvas created! Ready to paint.",
    components: createCanvasView(),
    flags: MessageFlags.Ephemeral,
  });
}

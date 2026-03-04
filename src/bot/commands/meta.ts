import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    EmbedBuilder,
    MessageFlags,
} from "discord.js";
import { DOMAIN_URL, EMBED_COLOUR } from "../../constants.js";
import { createVoteView } from "../ui/meta.js";

// ---- /help ----

export const helpCommandData = new SlashCommandBuilder()
    .setName("help")
    .setDescription("Learn how to use Pixel Arts");

export async function helpCommandExecute(
    interaction: ChatInputCommandInteraction,
) {
    const embed = new EmbedBuilder()
        .setTitle("Pixel Arts — Help")
        .setColor(EMBED_COLOUR)
        .setThumbnail(`${DOMAIN_URL}/static/icon.png`)
        .addFields(
            {
                name: "🖼️ /create canvas",
                value:
                    "Start a new pixel art canvas. Choose a size (5×5 up to 25×25) and an optional base colour.",
            },
            {
                name: "🔄 /recreate image",
                value:
                    "Upload any image and convert it into an editable pixel art canvas.",
            },
            {
                name: "🎨 Placing Pixels",
                value:
                    "On a **5×5** canvas, click the grid buttons directly.\n" +
                    "On larger canvases, use the **X / Y selectors** then hit **Place Pixel**.",
            },
            {
                name: "🛠️ Advanced Tools",
                value:
                    "Use the **Tool** menu to access Line, Rectangle, Outline, Bucket Fill, and Replace Colour tools.",
            },
            {
                name: "⏪ Undo",
                value: "Undo your last pixel placement (up to 3 times per minute).",
            },
            {
                name: "📼 Timelapse",
                value:
                    "Close a canvas and press **Timelapse** to generate a speed-adjustable replay video.",
            },
            {
                name: "⭐ Vote-only features",
                value:
                    "Custom colours, 20×25 canvases, and `/recreate` require a vote on Top.gg. Use **/vote** to unlock them.",
            },
            {
                name: "🔗 Links",
                value: `[Website](${DOMAIN_URL}) • [Support Server](https://discord.gg/ErBJ7JTUYe) • [Top.gg](https://top.gg/bot/1008692736720908318)`,
            },
        );

    await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral,
    });
}

// ---- /vote ----

export const voteCommandData = new SlashCommandBuilder()
    .setName("vote")
    .setDescription("Vote for Pixel Arts on Top.gg to unlock premium features");

export async function voteCommandExecute(
    interaction: ChatInputCommandInteraction,
) {
    const embed = new EmbedBuilder()
        .setTitle("Vote for Pixel Arts!")
        .setColor(EMBED_COLOUR)
        .setImage(`${DOMAIN_URL}/static/vote.png`)
        .setDescription(
            "Voting unlocks **custom colours**, **large canvases** (20×20 & 25×25), and **/recreate**.\n\n" +
                "Your vote lasts **12 hours** — thank you for the support! 🙏",
        );

    await interaction.reply({
        embeds: [embed],
        components: createVoteView(),
        flags: MessageFlags.Ephemeral,
    });
}

// ---- /invite ----

export const inviteCommandData = new SlashCommandBuilder()
    .setName("invite")
    .setDescription("Get the invite link to add Pixel Arts to your server");

export async function inviteCommandExecute(
    interaction: ChatInputCommandInteraction,
) {
    const embed = new EmbedBuilder()
        .setTitle("Invite Pixel Arts")
        .setColor(EMBED_COLOUR)
        .setThumbnail(`${DOMAIN_URL}/static/icon.png`)
        .setDescription(
            "Add Pixel Arts to your server and start creating collaborative pixel art with your friends!",
        );

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setLabel("Invite Bot")
            .setStyle(ButtonStyle.Link)
            .setURL("https://top.gg/bot/1008692736720908318/invite")
            .setEmoji("🤖"),
        new ButtonBuilder()
            .setLabel("Support Server")
            .setStyle(ButtonStyle.Link)
            .setURL("https://discord.gg/ErBJ7JTUYe")
            .setEmoji("💬"),
    );

    await interaction.reply({
        embeds: [embed],
        components: [row],
        flags: MessageFlags.Ephemeral,
    });
}
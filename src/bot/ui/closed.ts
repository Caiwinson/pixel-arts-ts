import {
    ActionRowBuilder,
    AttachmentBuilder,
    ButtonBuilder,
    ButtonInteraction,
    ButtonStyle,
    MessageFlags,
} from "discord.js";
import { getCanvasHistory, type CanvasHistoryRow } from "../../database.js";
import { spawn } from "child_process";
import path from "path";
import os from "os";
import fs from "fs";
import { PREVIEW_PATH } from "../../constants.js";

export function createClosedView(): ActionRowBuilder<ButtonBuilder>[] {
    const download = new ButtonBuilder()
        .setCustomId("download")
        .setLabel("Download")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("📥");

    const timelapse = new ButtonBuilder()
        .setCustomId("timelapse")
        .setLabel("Timelapse")
        .setStyle(ButtonStyle.Success)
        .setEmoji("📼");

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        download,
        timelapse,
    );

    return [row];
}

// Download button

export async function downloadButtonExecute(interaction: ButtonInteraction) {
    const url = interaction.message.embeds?.[0]?.image?.url;

    if (!url) {
        await interaction.reply({
            content: "No image found.",
            ephemeral: true,
        });
        return;
    }

    // Fetch the image
    const response = await fetch(url);

    if (!response.ok) {
        await interaction.reply({
            content: "Failed to download image.",
            ephemeral: true,
        });
        return;
    }

    // Convert to buffer
    const buffer = Buffer.from(await response.arrayBuffer());

    // Create attachment
    const attachment = new AttachmentBuilder(buffer, {
        name: "canvas.png",
    });

    // Send attachment
    await interaction.reply({
        files: [attachment],
        flags: MessageFlags.Ephemeral,
    });
}

// Timelapse button
export async function timelapseButtonExecute(interaction: ButtonInteraction) {
    try {
        // Fetch canvas history for this message / user
        const history = getCanvasHistory(interaction.message.id);

        if (!history || history.length === 0) {
            await interaction.editReply({
                content: "No canvas history found for timelapse.",
            });
            return;
        }

        const previewPath = path.join(
            PREVIEW_PATH,
            `${interaction.message.id}.mp4`,
        );

        // if file didnt exist
        if (!fs.existsSync(previewPath)) {
            // Generate video
            await generateTimelapseVideo(history, previewPath);
        }
        // Create attachment
        const attachment = new AttachmentBuilder(previewPath, {
            name: "timelapse.mp4",
        });

        // Send video
        await interaction.reply({
            content: "Here’s your timelapse video!",
            files: [attachment],
            flags: MessageFlags.Ephemeral,
        });
    } catch (err) {
        console.error(err);
        await interaction.editReply({
            content: "Failed to generate timelapse video.",
        });
    }
}

export async function generateTimelapseVideo(
    history: CanvasHistoryRow[],
    previewPath: string,
): Promise<void> {
    if (!history.length) throw new Error("No history");

    const size = Math.sqrt(history[0]!.key.length / 6) | 0;

    const videoSize = size === 5 ? 500 : 750;

    const scale = Math.floor(videoSize / size);

    const width = videoSize;

    const height = videoSize;

    const buffer = Buffer.alloc(width * height * 3);

    const pixelMap: number[][] = new Array(size * size);

    for (let py = 0; py < size; py++) {
        for (let px = 0; px < size; px++) {
            const indices: number[] = [];

            // map this small pixel to all output pixels it covers
            for (let y = 0; y < scale; y++) {
                for (let x = 0; x < scale; x++) {
                    const sx = px * scale + x; // scaled x
                    const sy = py * scale + y; // scaled y
                    const i = (sy * width + sx) * 3; // index in RGB buffer
                    indices.push(i);
                }
            }

            pixelMap[py * size + px] = indices;
        }
    }

    let pixels = new Array<string>(size * size).fill("000000");

    const ffmpeg = spawn("ffmpeg", [
        "-y",

        "-f",
        "rawvideo",

        "-pix_fmt",
        "rgb24",

        "-s",
        `${width}x${height}`,

        "-r",
        "1",

        "-i",
        "-",

        "-c:v",
        "libx264",

        "-pix_fmt",
        "yuv420p",

        "-preset",
        "fast",

        "-crf",
        "18",

        previewPath,
    ]);

    function writePixel(px: number, py: number, hex: string) {
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);

        // use precomputed indices
        for (const i of pixelMap[py * size + px]!) {
            buffer[i] = r;
            buffer[i + 1] = g;
            buffer[i + 2] = b;
        }
    }

    function renderFullFrame() {
        for (let i = 0; i < pixels.length; i++) {
            const x = i % size;

            const y = (i / size) | 0;

            writePixel(x, y, pixels[i]!);
        }
    }

    for (const row of history) {
        const line = row.key.trim();

        if (!line) continue;

        if (!row.is_delta) {
            pixels = line.match(/.{6}/g)!;

            renderFullFrame();
        } else {
            for (const entry of line.split(",")) {
                const [idxStr, hex] = entry.split(":");

                const idx = Number(idxStr);

                pixels[idx] = hex!;

                const x = idx % size;
                const y = (idx / size) | 0;

                writePixel(x, y, hex!);
            }
        }

        const frameBuffer = Buffer.from(buffer);
        ffmpeg.stdin.write(frameBuffer);
    }

    ffmpeg.stdin.end();

    await new Promise<void>((resolve, reject) => {
        ffmpeg.on("close", (code) => {
            if (code === 0) resolve();
            else reject();
        });
    });
}

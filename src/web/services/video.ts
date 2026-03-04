import path from "path";
import fs from "fs";
import { spawn } from "child_process";
import { PREVIEW_PATH } from "../../constants.js";

export interface VideoResult {
    outputPath: string | null;
    error: string | null;
}

/**
 * Returns the path to the video at the requested speed.
 * If speed === 1, returns the original file without running ffmpeg.
 * If speed > 60, appends the last frame of the sped-up video as a 1-frame
 * freeze so the final image is visible before the loop restarts.
 */
export async function generateDownloadVideo(
    videoId: string,
    speed: number,
): Promise<VideoResult> {
    const inputPath = path.join(PREVIEW_PATH, `${videoId}.mp4`);

    if (!fs.existsSync(inputPath)) {
        return { outputPath: null, error: "Preview not found" };
    }

    if (speed === 1) {
        return { outputPath: inputPath, error: null };
    }

    const fps = Math.min(speed, 60);
    const outputPath = path.join(PREVIEW_PATH, `${videoId}-${speed}.mp4`);

    if (fs.existsSync(outputPath)) {
        return { outputPath, error: null };
    }

    try {
        if (speed > 60) {
            await buildWithFreezeFrame(inputPath, outputPath, fps, speed);
        } else {
            await runFfmpeg(inputPath, outputPath, fps, speed);
        }
    } catch (err: any) {
        if (err.message === "timeout") {
            console.error(
                `Video processing timeout for ${videoId} at speed ${speed}`,
            );
            return { outputPath: null, error: "Video processing timeout" };
        }
        console.error(
            `Error generating video for ${videoId} at speed ${speed}: ${err}`,
        );
        return { outputPath: null, error: "Error generating video" };
    }

    if (!fs.existsSync(outputPath)) {
        console.error(
            `FFmpeg failed to create output file for ${videoId} at speed ${speed}`,
        );
        return { outputPath: null, error: "Error generating video" };
    }

    return { outputPath, error: null };
}

/**
 * Builds a sped-up video and appends one freeze frame at the end.
 * Uses a temp file for the sped-up clip, then concatenates with a
 * 1-frame freeze extracted from its last frame.
 */
async function buildWithFreezeFrame(
    inputPath: string,
    outputPath: string,
    fps: number,
    speed: number,
    timeoutMs = 60_000,
): Promise<void> {
    const tmpSped = outputPath + ".tmp_sped.mp4";
    const tmpFreeze = outputPath + ".tmp_freeze.mp4";
    const tmpList = outputPath + ".tmp_concat.txt";

    try {
        // Step 1: generate the sped-up clip
        await runFfmpeg(inputPath, tmpSped, fps, speed, timeoutMs);

        // Step 2: extract last frame as a 1-frame freeze clip (1 second display at original fps)
        await runFfmpegArgs(
            [
                "-sseof", "-1",
                "-i", tmpSped,
                "-vframes", "1",
                "-loop", "1",
                "-t", String(1 / fps),   // exactly one frame duration
                "-c:v", "libx264",
                "-pix_fmt", "yuv420p",
                "-preset", "fast",
                "-crf", "18",
                "-y",
                tmpFreeze,
            ],
            timeoutMs,
        );

        // Step 3: concat sped clip + freeze frame
        fs.writeFileSync(tmpList, `file '${tmpSped}'\nfile '${tmpFreeze}'\n`);

        await runFfmpegArgs(
            [
                "-f", "concat",
                "-safe", "0",
                "-i", tmpList,
                "-c", "copy",
                "-y",
                outputPath,
            ],
            timeoutMs,
        );
    } finally {
        for (const f of [tmpSped, tmpFreeze, tmpList]) {
            try { fs.unlinkSync(f); } catch { /* ignore */ }
        }
    }
}

function runFfmpeg(
    inputPath: string,
    outputPath: string,
    fps: number,
    speed: number,
    timeoutMs = 30_000,
): Promise<void> {
    return runFfmpegArgs(
        [
            "-i", inputPath,
            "-vf", `fps=${fps},setpts=PTS/${speed}`,
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            "-preset", "fast",
            "-crf", "18",
            "-y",
            outputPath,
        ],
        timeoutMs,
    );
}

function runFfmpegArgs(args: string[], timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
        const ffmpeg = spawn("ffmpeg", args);

        const timer = setTimeout(() => {
            ffmpeg.kill();
            reject(new Error("timeout"));
        }, timeoutMs);

        ffmpeg.on("close", (code) => {
            clearTimeout(timer);
            if (code === 0) resolve();
            else reject(new Error(`ffmpeg exited with code ${code}`));
        });

        ffmpeg.on("error", (err) => {
            clearTimeout(timer);
            reject(err);
        });
    });
}
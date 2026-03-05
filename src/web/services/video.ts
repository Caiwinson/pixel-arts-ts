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
 */
export async function generateDownloadVideo(
    videoId: string,
    speed: number,
): Promise<VideoResult> {
    const inputPath = path.join(PREVIEW_PATH, `${videoId}.mp4`);

    if (!fs.existsSync(inputPath)) {
        return { outputPath: null, error: "Preview not found" };
    }

    // Speed 1 → return original
    if (speed === 1) {
        return { outputPath: inputPath, error: null };
    }

    const fps = Math.min(speed, 60); // Cap FPS to 60
    const outputPath = path.join(PREVIEW_PATH, `${videoId}-${speed}.mp4`);

    if (fs.existsSync(outputPath)) {
        return { outputPath, error: null };
    }

    try {
        await runFfmpeg(inputPath, outputPath, fps, speed);
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

function runFfmpeg(
    inputPath: string,
    outputPath: string,
    fps: number,
    speed: number,
    timeoutMs = 30_000,
): Promise<void> {
    return new Promise((resolve, reject) => {
        // `tpad` adds a hold of the last frame for (speed) extra seconds so that
        // after PTS compression the final frame survives at least one output sample.
        // Without this, the last frame is almost always dropped when speed > 1
        // because it falls outside the last fps-filter sample window.
        const vf = `tpad=stop_mode=clone:stop_duration=${speed},fps=${fps},setpts=PTS/${speed}`;

        const ffmpeg = spawn("ffmpeg", [
            "-i",
            inputPath,
            "-vf",
            vf,
            "-y",
            outputPath,
        ]);

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

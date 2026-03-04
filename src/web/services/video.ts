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
 *
 * The last frame of the *original* video is always appended to the output so
 * that rounding / PTS truncation at high speeds never silently drops it.
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

    const fps = Math.min(speed, 60); // cap display FPS at 60
    const outputPath = path.join(PREVIEW_PATH, `${videoId}-${speed}.mp4`);

    if (fs.existsSync(outputPath)) {
        return { outputPath, error: null };
    }

    // Extract the last frame of the source as a PNG so we can append it.
    const lastFramePath = path.join(PREVIEW_PATH, `${videoId}-lastframe.png`);
    try {
        await extractLastFrame(inputPath, lastFramePath);
    } catch (err: any) {
        console.error(`Failed to extract last frame for ${videoId}: ${err}`);
        return { outputPath: null, error: "Error extracting last frame" };
    }

    try {
        await runFfmpeg(inputPath, lastFramePath, outputPath, fps, speed);
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
    } finally {
        // Clean up the temporary last-frame image
        fs.unlink(lastFramePath, () => {});
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
 * Extracts the very last frame of a video as a PNG.
 */
function extractLastFrame(
    inputPath: string,
    outputPng: string,
    timeoutMs = 10_000,
): Promise<void> {
    return new Promise((resolve, reject) => {
        // sseof=-0 seeks to the last frame
        const ffmpeg = spawn("ffmpeg", [
            "-sseof", "-1",
            "-i", inputPath,
            "-vframes", "1",
            "-q:v", "1",
            "-y",
            outputPng,
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

/**
 * Speeds up the video and appends the last frame so it is never dropped.
 *
 * Strategy:
 *   - Segment 1: the sped-up original  (fps=min(speed,60), setpts=PTS/speed)
 *   - Segment 2: the last frame held for one extra frame period (1/fps seconds)
 *
 * Both segments are concat-merged into the final output.
 */
function runFfmpeg(
    inputPath: string,
    lastFramePath: string,
    outputPath: string,
    fps: number,
    speed: number,
    timeoutMs = 30_000,
): Promise<void> {
    // How long to hold the appended last frame: one frame at the output FPS
    const lastFrameDuration = (1 / fps).toFixed(6);

    return new Promise((resolve, reject) => {
        /**
         * Filter graph:
         *   [0:v] speed up → [sped]
         *   [1:v] scale to match, hold for one frame → [tail]
         *   concat [sped][tail] → [out]
         */
        const filterComplex = [
            `[0:v]fps=${fps},setpts=PTS/${speed}[sped]`,
            `[1:v]scale=iw:ih,setsar=1,` +
                `tpad=stop_mode=clone:stop_duration=${lastFrameDuration}[tail]`,
            `[sped][tail]concat=n=2:v=1:a=0[out]`,
        ].join(";");

        const ffmpeg = spawn("ffmpeg", [
            "-i", inputPath,
            "-loop", "1", "-t", lastFrameDuration, "-i", lastFramePath,
            "-filter_complex", filterComplex,
            "-map", "[out]",
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            "-preset", "fast",
            "-crf", "18",
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
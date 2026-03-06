import { createCanvas, loadImage } from "@napi-rs/canvas";
import * as fs from "fs";
import * as crypto from "crypto";
import { NO_PLOT_DIR, PLOT_DIR, PLOT_OVERLAY_PATH } from "../../constants.js";
import { getCachedImage, storeImageInCache } from "./cache.js";
import { sendWebhookMessage } from "./webhook.js";
import { execFile } from "child_process";
import path from "path";

const PIXEL_RENDER_BIN =
    process.env.PIXEL_RENDER_BIN ??
    path.resolve(process.cwd(), "rust/pixel-render/target/release/pixel-render");

function hexStringToCanvas(code: string, size: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        execFile(
            PIXEL_RENDER_BIN,
            [code, String(size)],
            // `encoding: "buffer"` means stdout comes back as a raw Buffer,
            // not a UTF-8 string — important for binary PNG data.
            { encoding: "buffer", maxBuffer: 10 * 1024 * 1024 }, // 10 MB max
            (err, stdout, stderr) => {
                if (err) {
                    reject(
                        new Error(
                            `pixel-render failed: ${stderr?.toString() ?? err.message}`
                        )
                    );
                    return;
                }
                resolve(stdout);
            }
        );
    });
}

/**
 * Overlay the plot grid on top of a base PNG buffer.
 * Equivalent to img.paste(PLOT_OVERLAY, (0,0), PLOT_OVERLAY).
 */
async function applyPlotOverlay(basePng: Buffer): Promise<Buffer> {
    if (!fs.existsSync(PLOT_OVERLAY_PATH)) {
        console.warn("Plot overlay file not found, returning base image.");
        return basePng;
    }

    const [baseImg, overlayImg] = await Promise.all([
        loadImage(basePng),
        loadImage(PLOT_OVERLAY_PATH),
    ]);

    const canvas = createCanvas(baseImg.width, baseImg.height);
    const ctx = canvas.getContext("2d");

    // Flatten to pure RGB by painting a white background first (eliminates alpha channel)
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, baseImg.width, baseImg.height);

    ctx.drawImage(baseImg, 0, 0);
    ctx.drawImage(overlayImg, 0, 0);

    const rawPng = canvas.toBuffer("image/png");

    return rawPng;
}

export interface GenerateImageOptions {
    code: string;
    plotArg?: string;
    size?: number;
}

/**
 * Generate (or retrieve from cache) a PNG buffer for the given pixel art code.
 * Mirrors generate_image_data() in image_service.py.
 */
export async function generateImageData(
    opts: GenerateImageOptions,
): Promise<Buffer> {
    const { code, plotArg = "", size: sizeOpt } = opts;

    const size = sizeOpt ?? Math.round(Math.sqrt(code.length / 6));
    const imgKey = `${size}-${code}`;
    const imgHash = crypto.createHash("sha256").update(imgKey).digest("hex");
    const plot = plotArg.toLowerCase() === "true" && size > 5;

    // ---- Step 1: Ensure base (no-plot) image ----
    let basePng = getCachedImage(NO_PLOT_DIR, imgHash);

    if (!basePng) {
        console.info(`Generating base image for hash: ${imgHash}`);
        basePng = await hexStringToCanvas(code, size); // ← await added
        storeImageInCache(NO_PLOT_DIR, imgHash, basePng);
        sendWebhookMessage(size <= 15 ? code : imgHash);
    }

    // ---- Step 2: Return base if plot not requested ----
    if (!plot) {
        return basePng;
    }

    // ---- Step 3: Plotted version ----
    let plottedPng = getCachedImage(PLOT_DIR, imgHash);

    if (!plottedPng) {
        console.info(`Generating plotted image for hash: ${imgHash}`);
        plottedPng = await applyPlotOverlay(basePng);
        storeImageInCache(PLOT_DIR, imgHash, plottedPng);
    }

    return plottedPng;
}

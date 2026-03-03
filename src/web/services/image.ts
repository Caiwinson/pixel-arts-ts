import { createCanvas, loadImage } from "@napi-rs/canvas";
import * as fs from "fs";
import * as crypto from "crypto";
import { NO_PLOT_DIR, PLOT_DIR, PLOT_OVERLAY_PATH } from "../../constants.js";
import { getCachedImage, storeImageInCache } from "./cache.js";
import sharp from "sharp";
import { sendWebhookMessage } from "./webhook.js";

/**
 * Render pixel art directly at display size — no resize step.
 * 5x5 → 100px/cell (500×500), all others → 50px/cell.
 */
function hexStringToCanvas(code: string, size: number): Buffer {
    const scale = size === 5 ? 100 : 50;
    const dim = size * scale;

    const canvas = createCanvas(dim, dim);
    const ctx = canvas.getContext("2d");

    // Flatten to pure RGB by painting a white background first (eliminates alpha channel)
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, dim, dim);

    let i = 0;

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const hex = code.slice(i, i + 6);
            i += 6;

            ctx.fillStyle = `#${hex}`;
            ctx.fillRect(x * scale, y * scale, scale, scale);
        }
    }

    return canvas.toBuffer("image/png");
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
        basePng = hexStringToCanvas(code, size);
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

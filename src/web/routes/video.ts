import {
    Router,
    type Request,
    type Response,
    type RequestHandler,
} from "express";
import path from "path";
import fs from "fs";
import rateLimit from "express-rate-limit";
import { PREVIEW_PATH } from "../../constants.js";
import { generateDownloadVideo } from "../services/video.js";
import { getCanvasHistory } from "../../database.js";

const videoRouter = Router();

interface DownloadParams {
    code: string;
}

interface PreviewParams {
    code: string;
}

interface HistoryParams {
    messageId: string;
}

function stripExtension(value: string): string {
    return value.split(".")[0]!;
}

const downloadLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many requests, please try again later.",
});

const previewLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many requests, please try again later.",
});

/**
 * GET /download/:code
 * Generates and serves an MP4 at the requested speed.
 * Format: <videoId> or <videoId>-<speed>
 */
videoRouter.get("/download/:code", downloadLimiter, (async (
    req: Request<DownloadParams>,
    res: Response,
) => {
    let code = stripExtension(req.params.code);

    const parts = code.split("-");
    const vid = parts[0]!;

    let speed = 1;
    if (parts.length === 2) {
        const parsed = parseInt(parts[1]!);
        speed = parsed > 0 ? parsed : 1;
    }

    if (!/^[0-9]{5,20}$/.test(vid)) {
        res.status(400).send("Invalid video ID");
        return;
    }

    const { outputPath, error } = await generateDownloadVideo(vid, speed);

    if (error || !outputPath) {
        const isServerError =
            error?.toLowerCase().includes("timeout") ||
            error?.toLowerCase().includes("error");
        res.status(isServerError ? 500 : 404).send(error ?? "Unknown error");
        return;
    }

    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.setHeader("ETag", String(fs.statSync(outputPath).mtimeMs));
    res.sendFile(path.resolve(outputPath));
}) as unknown as RequestHandler);

/**
 * GET /preview/:code
 * Serves a cached MP4 timelapse file from PREVIEW_DIR.
 */
videoRouter.get("/preview/:code", previewLimiter, ((
    req: Request<PreviewParams>,
    res: Response,
) => {
    const raw = stripExtension(req.params.code);

    if (!/^[0-9]{5,20}$/.test(raw)) {
        res.status(400).send("Invalid preview ID");
        return;
    }

    const filePath = path.join(PREVIEW_PATH, `${raw}.mp4`);

    if (!fs.existsSync(filePath)) {
        res.status(404).send("Preview not found");
        return;
    }

    res.setHeader("Content-Type", "video/mp4");
    res.sendFile(filePath);
}) as unknown as RequestHandler);

/**
 * GET /canvas-history/:messageId
 * Returns stripped canvas history JSON for a given message ID.
 * Only responds if the timelapse video already exists (auth gate).
 * Sensitive fields (user_id, timestamp, readable_time) are omitted.
 */
videoRouter.get("/canvas-history/:messageId", previewLimiter, (async (
    req: Request<HistoryParams>,
    res: Response,
) => {
    const { messageId } = req.params;

    if (!/^[0-9]{5,20}$/.test(messageId)) {
        res.status(400).send("Invalid message ID");
        return;
    }

    // Auth: only serve history if the timelapse video already exists
    const videoPath = path.join(PREVIEW_PATH, `${messageId}.mp4`);
    if (!fs.existsSync(videoPath)) {
        res.status(404).send("Timelapse not found");
        return;
    }

    try {
        const history = await getCanvasHistory(messageId);

        if (!history || history.length === 0) {
            res.status(404).send("No history found");
            return;
        }

        // Strip sensitive fields — only expose what the renderer needs
        const safe = history.map(({ row_id, key, is_delta }) => ({
            row_id,
            key,
            is_delta,
        }));

        res.json(safe);
    } catch (err) {
        console.error(`Canvas history fetch failed for ${messageId}: ${err}`);
        res.status(500).send("Error fetching history");
    }
}) as unknown as RequestHandler);

export default videoRouter;
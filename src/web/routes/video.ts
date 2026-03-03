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

const videoRouter = Router();

interface DownloadParams {
    code: string;
}

interface PreviewParams {
    code: string;
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

export default videoRouter;

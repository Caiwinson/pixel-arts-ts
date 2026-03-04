import crypto from "crypto";
import { recordVote } from "../../database.js";
import { TOPGG_WEBHOOK } from "../../constants.js";
import { Router, type Request, type Response, raw } from "express";
import { sendWebhookMessage } from "../services/webhook.js";
import rateLimit from "express-rate-limit";

const voteRouter = Router();

const topggLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 60, // limit each IP to 60 requests per window
    standardHeaders: true,
    legacyHeaders: false,
});

/**
 * Verifies Top.gg webhook signature (V2)
 * HMAC_SHA256(secret, timestamp + '.' + raw_body)
 */
function verifySignature(
    secret: string,
    rawBody: Buffer,
    signatureHeader: string,
): boolean {
    try {
        const items = Object.fromEntries(
            signatureHeader.split(",").map((item) => {
                const [k, v] = item.trim().split("=");
                return [k, v];
            }),
        );

        const timestamp = items["t"];
        const receivedSig = items["v1"];

        if (!timestamp || !receivedSig) return false;

        const message = Buffer.concat([Buffer.from(`${timestamp}.`), rawBody]);

        const expectedSig = crypto
            .createHmac("sha256", secret)
            .update(message)
            .digest("hex");

        const expected = Buffer.from(expectedSig, "hex");
        const received = Buffer.from(receivedSig, "hex");

        if (expected.length !== received.length) return false;

        return crypto.timingSafeEqual(expected, received);
    } catch {
        return false;
    }
}

// Top.gg webhook endpoint
voteRouter.post(
    "/topgg-webhook",
    topggLimiter,
    // Use raw parser only for this route
    raw({ type: "application/json" }),
    async (req: Request, res: Response) => {
        const secret = TOPGG_WEBHOOK;
        const signature = req.header("x-topgg-signature");

        if (!secret || !signature) {
            return res.status(401).send("Unauthorized");
        }

        const rawBody = req.body as Buffer;

        if (!verifySignature(secret, rawBody, signature)) {
            return res.status(401).send("Unauthorized");
        }

        let payload: any;
        try {
            payload = JSON.parse(rawBody.toString("utf8"));
        } catch {
            return res.status(400).send("Bad Request");
        }

        if (!payload?.type) {
            return res.status(400).send("Bad Request");
        }

        const eventType = payload.type;
        const data = payload.data ?? {};

        if (eventType === "vote.create") {
            const userId = data?.user?.platform_id;

            if (!userId) {
                return res.status(400).send("Bad Request");
            }

            console.info(`Top.gg Vote: ${userId}`);

            await recordVote(userId);

            // fire-and-forget async webhook send
            sendWebhookMessage(`Voted ${userId}`).catch(console.error);
        } else if (eventType === "webhook.test") {
            const userId = data?.user?.id;
            console.info(`Top.gg Webhook Test: ${userId}`);
        }

        return res.sendStatus(200);
    },
);

export default voteRouter;

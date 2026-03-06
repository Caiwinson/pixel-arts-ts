import { Client, ActivityType } from "discord.js";
import { TOPGG_API_TOKEN } from "../constants.js";
import { getCanvasCount } from "../database.js";

// ---- Status Rotation ----

const STATUSES: { name: string; type: ActivityType }[] = [
    { name: "/create canvas", type: ActivityType.Playing },
    { name: "People draw", type: ActivityType.Watching },
    { name: "Pixel Art", type: ActivityType.Playing },
    { name: "Vote Pixel Arts on top.gg", type: ActivityType.Playing },
    { name: "Unleash your creativity", type: ActivityType.Playing },
    { name: "Collaborative art in progress", type: ActivityType.Watching },
    { name: "Masterpieces being created", type: ActivityType.Watching },
    { name: "Art is life", type: ActivityType.Playing },
    { name: "Microsoft Paint", type: ActivityType.Playing },
    { name: "Paint dry.", type: ActivityType.Watching },
];

async function getGuildCount(client: Client): Promise<number> {
    if (client.shard) {
        const counts = await client.shard
            .fetchClientValues("guilds.cache.size")
            .catch(() => null);
        return counts
            ? (counts as number[]).reduce((a, b) => a + b, 0)
            : (await client.guilds.fetch()).size;
    }
    return (await client.guilds.fetch()).size;
}

async function getDynamicStatus(
    client: Client,
): Promise<{ name: string; type: ActivityType }> {
    const [canvasCount, guildCount] = await Promise.all([
        getCanvasCount(),
        getGuildCount(client),
    ]);
    return {
        name: `${canvasCount} Canvases, ${guildCount} guilds`,
        type: ActivityType.Watching,
    };
}

export async function rotateStatus(client: Client): Promise<void> {
    try {
        const useDynamic = Math.random() < 1 / (STATUSES.length + 1);

        const status = useDynamic
            ? await getDynamicStatus(client)
            : STATUSES[Math.floor(Math.random() * STATUSES.length)]!;

        client.user?.setActivity({ name: status.name, type: status.type });
    } catch (err) {
        console.error("Failed to update status:", err);
    }
}

// ---- Top.gg Stat Posting ----

export async function postTopggStats(client: Client): Promise<void> {
    if (!TOPGG_API_TOKEN) {
        console.warn("TOPGG_API_TOKEN not set — skipping stat post.");
        return;
    }

    try {
        const guildCount = await getGuildCount(client);

        const res = await fetch(
            "https://top.gg/api/bots/1008692736720908318/stats",
            {
                method: "POST",
                headers: {
                    Authorization: TOPGG_API_TOKEN,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ server_count: guildCount }),
            },
        );

        if (!res.ok) {
            console.error(
                `Top.gg stat post failed: ${res.status} ${res.statusText}`,
            );
        } else {
            console.log(`Top.gg stats posted — ${guildCount} guilds`);
        }
    } catch (err) {
        console.error("Failed to post Top.gg stats:", err);
    }
}

// ---- Task Runner ----

const STATUS_INTERVAL_MS = 60_000;       // 1 minute
const TOPGG_INTERVAL_MS = 30 * 60_000;  // 30 minutes

export function startTasks(client: Client): void {
    rotateStatus(client);
    setInterval(() => rotateStatus(client), STATUS_INTERVAL_MS);

    setTimeout(() => {
        postTopggStats(client);
        setInterval(() => postTopggStats(client), TOPGG_INTERVAL_MS);
    }, 600_000);

    console.log("🔄 Bot tasks started (status rotation + Top.gg stats)");
}
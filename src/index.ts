import { ShardingManager } from "discord.js";
import { DISCORD_TOKEN } from "./constants.js";
import app from "./web/server.js";
import { initDb, closeDb } from "./database.js";

const MODE = process.env.APP_MODE;

await initDb();

function handleShutdown(signal: string, shutdown: () => Promise<void>) {
    process.on(signal, async () => {
        console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
        try {
            await shutdown();
            console.log("✅ Shutdown complete.");
            process.exit(0);
        } catch (err) {
            console.error("❌ Error during shutdown:", err);
            process.exit(1);
        }
    });
}

async function startWeb() {
    app.set("trust proxy", 1);

    const server = app.listen(8080, () => {
        console.log("🌐 Web server listening on port 8080");
    });

    const shutdown = async () => {
        await new Promise<void>((resolve, reject) => {
            server.close((err) => (err ? reject(err) : resolve()));
        });
        await closeDb();
    };

    handleShutdown("SIGTERM", shutdown);
    handleShutdown("SIGINT", shutdown);
}

async function startBot() {
    const manager = new ShardingManager("./dist/bot/bot.js", {
        token: DISCORD_TOKEN!,
        totalShards: "auto",
    });

    manager.on("shardCreate", (shard) => {
        console.log(`🚀 Shard ${shard.id} launched`);
    });

    const shutdown = async () => {
        console.log("🔌 Killing all shards...");
        manager.shards.forEach((shard) => shard.kill());
        await closeDb();
    };

    handleShutdown("SIGTERM", shutdown);
    handleShutdown("SIGINT", shutdown);

    await manager.spawn();
}

switch (MODE) {
    case "web":
        console.log("Starting WEB mode");
        await startWeb();
        break;

    case "bot":
        console.log("Starting BOT mode");
        await startBot();
        break;

    default:
        console.error("❌ APP_MODE must be 'web' or 'bot'");
        process.exit(1);
}
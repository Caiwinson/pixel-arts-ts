import { ShardingManager } from "discord.js";
import { DISCORD_TOKEN } from "./constants.js";
import app from "./web/server.js";
import { initDb } from "./database.js";

const MODE = process.env.APP_MODE;

initDb();

async function startWeb() {
    app.set("trust proxy", 1);

    app.listen(8080, () => {
        console.log("🌐 Web server listening on port 8080");
    });
}

async function startBot() {
    const manager = new ShardingManager("./dist/bot/bot.js", {
        token: DISCORD_TOKEN!,
        totalShards: "auto",
    });

    manager.on("shardCreate", (shard) => {
        console.log(`🚀 Shard ${shard.id} launched`);
    });

    await manager.spawn();
}

switch (MODE) {
    case "web":
        console.log("Starting WEB mode");
        startWeb();
        break;

    case "bot":
        console.log("Starting BOT mode");
        startBot();
        break;

    default:
        console.error("❌ APP_MODE must be 'web' or 'bot'");
        process.exit(1);
}

import { ShardingManager } from "discord.js";
import { DISCORD_TOKEN } from "./constants.js";
import app from "./web/server.js";
import { initDb } from "./database.js";

initDb();

app.set('trust proxy', 1)
app.listen(8080, () => {
    console.log("🌐 Web server listening on port 8080");
});

const manager = new ShardingManager("./dist/bot/bot.js", {
    token: DISCORD_TOKEN!,

    totalShards: 7,
});

manager.on("shardCreate", (shard) => {
    console.log(`🚀 Shard ${shard.id} launched`);
});

manager.spawn();

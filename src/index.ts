import { ShardingManager } from "discord.js";
import { DISCORD_TOKEN } from "./constants.js";
import app from "./web/server.js";

app.listen(8080, () => {
    console.log("🌐 Web server listening on port 8080");
});

const manager = new ShardingManager("./dist/bot/bot.js", {
    token: DISCORD_TOKEN!,

    totalShards: "auto",
});

manager.on("shardCreate", (shard) => {
    console.log(`🚀 Shard ${shard.id} launched`);
});

manager.spawn();

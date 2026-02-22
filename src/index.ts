import "dotenv/config";

import { ShardingManager } from "discord.js";

const manager = new ShardingManager("./dist/bot/bot.js", {
    token: process.env.DISCORD_TOKEN!,

    totalShards: "auto",
});

manager.on("shardCreate", (shard) => {
    console.log(`🚀 Shard ${shard.id} launched`);
});

manager.spawn();

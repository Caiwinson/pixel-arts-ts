import { ShardingManager } from "discord.js";
import { DISCORD_TOKEN } from "./constants.js";

const manager = new ShardingManager("./dist/bot/bot.js", {
    token: DISCORD_TOKEN!,

    totalShards: "auto",
});

manager.on("shardCreate", (shard) => {
    console.log(`🚀 Shard ${shard.id} launched`);
});

manager.spawn();

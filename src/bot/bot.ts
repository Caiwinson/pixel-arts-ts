import {
    Client,
    GatewayIntentBits,
    Events,
    ClientApplication,
} from "discord.js";
import { DISCORD_TOKEN } from "../constants.js";
import { refreshCommands } from "./deploy-commands.js";

// Import your interaction handler
import interactionCreate from "./interactionCreate.js";
import { startTasks } from "./tasks.js";
import { syncEmojiTable } from "../database.js";

const client = new Client({
    intents: [GatewayIntentBits.Guilds],
});
export let application: ClientApplication;

// Ready event
client.once(Events.ClientReady, async (c) => {
    application = c.application;
    if (client.shard?.ids.includes(0) ?? true) {
        refreshCommands();
        startTasks(c);

        // Sync emoji table from Discord API once on startup
        try {
            const emojis = await c.application.emojis.fetch();
            await syncEmojiTable([...emojis.values()]);
            console.log(`✅ Synced ${emojis.size} emojis to DB`);
        } catch (err) {
            console.error("Failed to sync emoji table:", err);
        }

        console.log(`✅ Logged in as ${c.user.tag}`);
    }
});

// Interaction event
client.on(Events.InteractionCreate, interactionCreate.execute);

// Login
client.login(DISCORD_TOKEN);

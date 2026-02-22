import "dotenv/config";
import { Client, GatewayIntentBits, Events } from "discord.js";

// Import your interaction handler
import interactionCreate from "./events/interactionCreate.js";

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

// Ready event
client.once(Events.ClientReady, c => {
    console.log(`✅ Logged in as ${c.user.tag}`);
});

// Interaction event
client.on(Events.InteractionCreate, interactionCreate.execute);

// Login
client.login(process.env.DISCORD_TOKEN);
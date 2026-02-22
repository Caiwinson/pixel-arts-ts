import { Client, GatewayIntentBits, Events } from "discord.js";
import { DISCORD_TOKEN } from "../constants.js";
import { refreshCommands } from "./deploy-commands.js";

// Import your interaction handler
import interactionCreate from "./events/interactionCreate.js";

const client = new Client({
    intents: [GatewayIntentBits.Guilds],
});

// Ready event
client.once(Events.ClientReady, (c) => {
    refreshCommands(c.application.id);
    console.log(`✅ Logged in as ${c.user.tag}`);
});

// Interaction event
client.on(Events.InteractionCreate, interactionCreate.execute);

// Login
client.login(DISCORD_TOKEN);

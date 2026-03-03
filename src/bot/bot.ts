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

const client = new Client({
    intents: [GatewayIntentBits.Guilds],
});
export let application: ClientApplication;

// Ready event
client.once(Events.ClientReady, (c) => {
    application = c.application;
    if (client.shard?.ids.includes(0) ?? true) {
        refreshCommands();
        console.log(`✅ Logged in as ${c.user.tag}`);
    }
});

// Interaction event
client.on(Events.InteractionCreate, interactionCreate.execute);

// Login
client.login(DISCORD_TOKEN);

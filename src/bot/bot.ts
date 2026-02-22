import "dotenv/config"

import {
    Client,
    GatewayIntentBits,
    Events
} from "discord.js"

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
})

client.once(Events.ClientReady, (client) => {
    console.log(`✅ Logged in as ${client.user.tag}`)
})

client.login(process.env.DISCORD_TOKEN)
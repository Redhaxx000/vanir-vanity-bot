import { Client, GatewayIntentBits, Partials, ActivityType, EmbedBuilder } from "discord.js";
import * as http from "node:http";
import "dotenv/config";

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Configuration â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const TOKEN      = process.env.DISCORD_TOKEN;
const GUILD_ID   = process.env.GUILD_ID;
const ROLE_ID    = process.env.ROLE_ID;
const VANITY     = (process.env.VANITY || "/vanir").toLowerCase();
const CHANNEL_ID = process.env.CHANNEL_ID;
const PORT       = process.env.PORT || 3000;

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Keep-alive HTTP server â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
http
  .createServer((_, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Bot is running\n");
  })
  .listen(PORT, () => {
    console.log("ðŸŒ Keep-alive server on " + PORT);
  });

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Discord client â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const client = new Client({
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,      // 👈 sees messages
    GatewayIntentBits.MessageContent      // 👈 reads message text
  ],
  partials: [Partials.Channel]            // keep partials if you need them
});

const reppedUsers = new Set(); // to prevent repeat messages during session

client.once("ready", () => {
  console.log(`âœ… Logged in as ${client.user.tag}`);
});

client.on("presenceUpdate", async (_oldPresence, newPresence) => {
  try {
    if (!newPresence || newPresence.guild?.id !== GUILD_ID) return;

    const custom = newPresence.activities.find(
      (a) => a.type === ActivityType.Custom && a.state
    );
    const hasVanity = custom && custom.state.toLowerCase().includes(VANITY);

    const member = await newPresence.guild.members.fetch(newPresence.userId);
    const alreadyHasRole = member.roles.cache.has(ROLE_ID);

    if (hasVanity && !alreadyHasRole && !reppedUsers.has(member.id)) {
      await member.roles.add(ROLE_ID, "Vanity detected in custom status");
      reppedUsers.add(member.id);
      console.log(`ðŸŽ‰ Added role to ${member.user.tag}`);

      const channel = newPresence.guild.channels.cache.get(CHANNEL_ID);
      if (channel && channel.isTextBased()) {
        const embed = new EmbedBuilder()
          .setColor(0x2f3136)
          .setThumbnail(newPresence.guild.iconURL())
          .setDescription([
            "_ _     thank you for repping us    　  𓂃 ",
            "> **pic** __perms__",
            "> **sticker** __perms__",
            "> **cam** __perms__",
          ].join("\n"))
          .setFooter({ text: "rep /vanir in your status for perks" })
          .setTimestamp();

        await channel.send({
          content: `${member} has repped **${VANITY}**`,
          embeds: [embed],
        });
      }
    }

    if (!hasVanity && alreadyHasRole) {
      await member.roles.remove(ROLE_ID, "Vanity removed from custom status");
      reppedUsers.delete(member.id);
      console.log(`ðŸš« Removed role from ${member.user.tag}`);
    }
  } catch (err) {
    console.error("presenceUpdate error:", err);
  }
});

client.login(TOKEN);

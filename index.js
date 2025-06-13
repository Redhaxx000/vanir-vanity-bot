import { Client, GatewayIntentBits, Partials, ActivityType, EmbedBuilder } from "discord.js";
import * as http from "node:http";
import "dotenv/config";

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Configuration â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const TOKEN      = process.env.DISCORD_TOKEN;   // bot token
const GUILD_ID   = process.env.GUILD_ID;        // server ID
const ROLE_ID    = process.env.ROLE_ID;         // role to grant
const VANITY     = (process.env.VANITY || "/vanir").toLowerCase(); // tag to detect
const CHANNEL_ID = process.env.CHANNEL_ID;      // channel for embeds
const PORT       = process.env.PORT || 3000;    // Render keeps web services alive

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
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
  ],
  partials: [Partials.GuildMember, Partials.User],
});

client.once("ready", () => {
  console.log(`âœ… Logged in as ${client.user.tag}`);
});

client.on("presenceUpdate", async (_oldPresence, newPresence) => {
  try {
    if (!newPresence || newPresence.guild?.id !== GUILD_ID) return;

    // look for custom status containing the vanity tag
    const custom = newPresence.activities.find(
      (a) => a.type === ActivityType.Custom && a.state
    );
    const hasVanity = custom && custom.state.toLowerCase().includes(VANITY);

    const member = await newPresence.guild.members.fetch(newPresence.userId);
    const alreadyHasRole = member.roles.cache.has(ROLE_ID);

    if (hasVanity && !alreadyHasRole) {
      await member.roles.add(ROLE_ID, "Vanity detected in custom status");
      console.log(`ðŸŽ‰ Added role to ${member.user.tag}`);

      const channel = newPresence.guild.channels.cache.get(CHANNEL_ID);
      if (channel && channel.isTextBased()) {
        const embed = new EmbedBuilder()
          .setColor(0x2ecc71)
          .setAuthor({ name: member.user.username, iconURL: member.displayAvatarURL() })
          .setThumbnail(newPresence.guild.iconURL())
          .setTitle(`${member.displayName} has repped **${VANITY}**`)
          .setDescription([
            "_ _     thank you for repping us      ð“‚ƒ",
            "> **pic** __perms__",
            "> **sticker** __perms__",
            "> **cam** __perms__",
          ].join("\n"))
          .setFooter({ text: "rep /vanir in your status for perks" })
          .setTimestamp();

        channel.send({ embeds: [embed] });
      }
    }

    // remove role if the vanity disappeared
    if (!hasVanity && alreadyHasRole) {
      await member.roles.remove(ROLE_ID, "Vanity removed from custom status");
      console.log(`ðŸš« Removed role from ${member.user.tag}`);
    }
  } catch (err) {
    console.error("presenceUpdate error:", err);
  }
});

client.login(TOKEN);

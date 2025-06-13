import { Client, GatewayIntentBits, Partials, ActivityType, EmbedBuilder } from "discord.js"; import http from "node:http"; import "dotenv/config";

// ⚙️ Config from Render / .env const TOKEN        = process.env.DISCORD_TOKEN; // bot token const GUILD_ID     = process.env.GUILD_ID;      // server ID const ROLE_ID      = process.env.ROLE_ID;       // role to grant const VANITY       = process.env.VANITY || "/vanir"; // string to look for const CHANNEL_ID   = process.env.CHANNEL_ID;    // channel to post embed const PORT         = process.env.PORT || 3000;  // Render keeps web services alive

/* ------------------------------------------------------------------ Keep-alive HTTP server so Render doesn’t spin the dyno down -------------------------------------------------------------------*/ http .createServer((_, res) => { res.writeHead(200, { "Content-Type": "text/plain" }); res.end("Bot is running\n"); }) .listen(PORT, () => console.log(🌐 Keep-alive server on ${PORT}));

/* ------------------------------------------------------------------ Discord bot logic -------------------------------------------------------------------*/ const client = new Client({ intents: [ GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildPresences, ], partials: [Partials.GuildMember, Partials.User], });

client.once("ready", () => { console.log(✅ Logged in as ${client.user.tag}); });

client.on("presenceUpdate", async (_oldPresence, newPresence) => { try { if (!newPresence || newPresence.guild?.id !== GUILD_ID) return;

const custom = newPresence.activities.find(
  (a) => a.type === ActivityType.Custom && a.state
);
const hasVanity = custom && custom.state.toLowerCase().includes(VANITY.toLowerCase());

const member = await newPresence.guild.members.fetch(newPresence.userId);
const alreadyHasRole = member.roles.cache.has(ROLE_ID);

if (hasVanity && !alreadyHasRole) {
  await member.roles.add(ROLE_ID, "Vanity detected in custom status");
  console.log(`🎉 Added role to ${member.user.tag}`);

  const channel = newPresence.guild.channels.cache.get(CHANNEL_ID);
  if (channel && channel.isTextBased()) {
    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setAuthor({ name: member.user.username, iconURL: member.displayAvatarURL() })
      .setThumbnail(newPresence.guild.iconURL())
      .setTitle(`${member.toString()} has repped **${VANITY}**`)
      .setDescription(
        `_ _     thank you for repping us    　  𓂃 　\n` +
        `> **pic** __perms__\n` +
        `> **sticker** __perms__\n` +
        `> **cam** __perms__`
      )
      .setFooter({ text: "rep /vanir in your status for perks" })
      .setTimestamp();

    channel.send({ embeds: [embed] });
  }
} else if (!hasVanity && alreadyHasRole) {
  await member.roles.remove(ROLE_ID, "Vanity removed from custom status");
  console.log(`🚫 Removed role from ${member.user.tag}`);
}

} catch (err) { console.error("presenceUpdate error:", err); } });

client.login(TOKEN);


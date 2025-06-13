import { Client, GatewayIntentBits, Partials, ActivityType, EmbedBuilder } from "discord.js"; import http from "node:http"; import "dotenv/config";

// ⚙️ Config comes from Render environment variables after deployment const TOKEN  = process.env.DISCORD_TOKEN; // your bot token const GUILD_ID = process.env.GUILD_ID;   // ID of the Discord server const ROLE_ID  = process.env.ROLE_ID;    // ID of the role to grant const VANITY   = process.env.VANITY || "#veil";  // string to search for in the custom status const PORT     = process.env.PORT || 3000;        // Render exposes $PORT for web services

/* ------------------------------------------------------------------ Keep‑alive HTTP server so Render treats this as a Web Service. This stays lightweight: just returns 200 OK and “Bot is running”. -------------------------------------------------------------------*/ http .createServer((_, res) => { res.writeHead(200, { "Content-Type": "text/plain" }); res.end("Bot is running\n"); }) .listen(PORT, () => { console.log(🌐 Keep‑alive server listening on ${PORT}); });

/* ------------------------------------------------------------------ Discord Bot Logic -------------------------------------------------------------------*/ const client = new Client({ intents: [ GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildPresences, ], partials: [Partials.GuildMember, Partials.User], });

client.once("ready", () => { console.log(✅ Logged in as ${client.user.tag}); });

// Fired whenever a member's presence or activities change client.on("presenceUpdate", async (_oldPresence, newPresence) => { try { if (!newPresence || newPresence.guild?.id !== GUILD_ID) return;

// Look for the custom status
const custom = newPresence.activities.find(
  (a) => a.type === ActivityType.Custom && a.state
);

const hasVanity =
  custom && custom.state.toLowerCase().includes(VANITY.toLowerCase());

const member = await newPresence.guild.members.fetch(newPresence.userId);
const alreadyHasRole = member.roles.cache.has(ROLE_ID);

// Give role if vanity present, remove if not
if (hasVanity && !alreadyHasRole) {
  await member.roles.add(ROLE_ID, "Vanity detected in custom status");
  console.log(`🎉 Added role to ${member.user.tag}`);

  const channel = newPresence.guild.systemChannel; // post in #general or system channel
  if (channel) {
    const embed = new EmbedBuilder()
      .setAuthor({ name: member.user.tag, iconURL: member.displayAvatarURL() })
      .setDescription(`rep’d **${VANITY}** in their status • role unlocked!`)
      .setColor(0x2ecc71)
      .setTimestamp();

    channel.send({ embeds: [embed] });
  }
} else if (!hasVanity && alreadyHasRole) {
  await member.roles.remove(ROLE_ID, "Vanity removed from custom status");
  console.log(`🚫 Removed role from ${member.user.tag}`);
}

} catch (err) { console.error("Presence handler error:", err); } });

client.login(TOKEN);


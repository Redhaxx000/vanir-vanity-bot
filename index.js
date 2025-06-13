/**
 * Discord Vanity-Role Bot
 * - Grants a role the first time a member’s custom status contains the vanity tag
 * - Pings + embeds ONCE per user (persists across restarts)
 * - All IDs (role / channel) are set via slash commands, not env vars
 *
 * Slash sub-commands (Manage Server required):
 *   /vanity role    <@role>      – set / change the role the bot gives
 *   /vanity channel <#channel>   – set / change the channel for announcements
 *   /vanity message <text>       – change the body of the embed (use \n or {nl})
 *   /vanity resetping            – clear the “already-pinged” memory for this guild
 */

import {
  Client,
  GatewayIntentBits,
  Partials,
  ActivityType,
  EmbedBuilder,
  SlashCommandBuilder,
  REST,
  Routes,
  PermissionsBitField,
} from "discord.js";
import * as http from "node:http";
import "dotenv/config";
import fs from "fs";

// ────────────────────────── ENV ONLY NEEDS TOKEN & CLIENT_ID ──────────────────────────
const TOKEN     = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;               // your application / bot ID
const PORT      = process.env.PORT || 3000;             // for Render keep-alive

const PING_FILE   = "./pinged.json";   // { guildId: [userIds...] }
const CONFIG_FILE = "./guild_config.json"; // { guildId: { roleId, channelId, embedLines[] } }

// ────────────────────────── SMALL DISK HELPERS ──────────────────────────
function loadJSON(path, fallback) {
  try { return fs.existsSync(path) ? JSON.parse(fs.readFileSync(path)) : fallback; }
  catch { return fallback; }
}
function saveJSON(path, data) {
  try { fs.writeFileSync(path, JSON.stringify(data, null, 2)); } catch {/* ignore */}
}

const pinged = loadJSON(PING_FILE, {});          // Map<guildId, string[]>
const guildCfg = loadJSON(CONFIG_FILE, {});      // Map<guildId, {roleId, channelId, embedLines[]}>

// ────────────────────────── KEEP-ALIVE SERVER (Render) ──────────────────────────
http.createServer((_, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Bot is running\n");
}).listen(PORT, () => console.log("🌐 Keep-alive server on " + PORT));

// ────────────────────────── SLASH COMMANDS ──────────────────────────
const slash = new SlashCommandBuilder()
  .setName("vanity")
  .setDescription("Vanity-role bot controls (Manage Server only)")
  .addSubcommand(s =>
    s.setName("role")
     .setDescription("Set the role to give")
     .addRoleOption(o => o.setName("role").setDescription("Role").setRequired(true)))
  .addSubcommand(s =>
    s.setName("channel")
     .setDescription("Set the channel for announcements")
     .addChannelOption(o => o.setName("channel").setDescription("Channel").setRequired(true)))
  .addSubcommand(s =>
    s.setName("message")
     .setDescription("Set the embed body (use \\n or {nl} for line breaks)")
     .addStringOption(o => o.setName("text").setDescription("Body").setRequired(true)))
  .addSubcommand(s => s.setName("resetping").setDescription("Clear ‘already-pinged’ memory"));

const rest = new REST({ version: "10" }).setToken(TOKEN);

// ────────────────────────── DISCORD CLIENT ──────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
  ],
  partials: [Partials.GuildMember, Partials.User],
});

// Register commands per-guild on startup for instant updates
client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  try {
    for (const [guildId] of client.guilds.cache) {
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, guildId), { body: [slash.toJSON()] });
    }
    console.log("✅ Slash commands registered in all guilds.");
  } catch (err) {
    console.error("Slash registration error:", err);
  }
});

// ────────────────────────── PRESENCE HANDLER ──────────────────────────
const VANITY = "/vanir";                    // hard-coded tag (edit if you want)

client.on("presenceUpdate", async (_old, pres) => {
  const g = pres?.guild;
  if (!g) return;

  const cfg = guildCfg[g.id];
  if (!cfg?.roleId || !cfg?.channelId) return; // not configured

  const custom = pres.activities.find(a => a.type === ActivityType.Custom && a.state);
  const hasVanity = custom && custom.state.toLowerCase().includes(VANITY);
  const m = await g.members.fetch(pres.userId);

  const hasRole = m.roles.cache.has(cfg.roleId);
  const alreadyPinged = (pinged[g.id] ?? []).includes(m.id);

  /* ───── Give role & ping ONCE ───── */
  if (hasVanity && !hasRole) {
    await m.roles.add(cfg.roleId, "Vanity detected");
    if (!alreadyPinged) {
      const ch = g.channels.cache.get(cfg.channelId);
      if (ch?.isTextBased()) {
        const lines = cfg.embedLines ?? [
          "_ _     thank you for repping us    　  𓂃 　 ",
          "> **pic** __perms__",
          "> **sticker** __perms__",
          "> **cam** __perms__",
        ];

        const embed = new EmbedBuilder()
          .setColor(0x2f3136)
          .setThumbnail(g.iconURL())
          .setDescription(lines.join("\n"))
          .setFooter({ text: "rep /vanir in your status for perks" })
          .setTimestamp();

        await ch.send({ content: `${m} has repped **${VANITY}**`, embeds: [embed] });
      }
      pinged[g.id] = [...(pinged[g.id] ?? []), m.id];
      saveJSON(PING_FILE, pinged);
    }
  }

  /* ───── Remove role if tag gone but custom status still exists ───── */
  if (hasRole && custom && !hasVanity) {
    await m.roles.remove(cfg.roleId, "Vanity removed");
  }
});

// ────────────────────────── SLASH COMMAND HANDLER ──────────────────────────
client.on("interactionCreate", async (int) => {
  if (!int.isChatInputCommand() || int.commandName !== "vanity") return;

  if (!int.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
    return int.reply({ content: "You need **Manage Server** permission.", ephemeral: true });
  }

  const g = int.guild;
  guildCfg[g.id] = guildCfg[g.id] || {};

  switch (int.options.getSubcommand()) {
    case "role":
      guildCfg[g.id].roleId = int.options.getRole("role").id;
      saveJSON(CONFIG_FILE, guildCfg);
      return int.reply({ content: "✅ Role set.", ephemeral: true });

    case "channel":
      guildCfg[g.id].channelId = int.options.getChannel("channel").id;
      saveJSON(CONFIG_FILE, guildCfg);
      return int.reply({ content: "✅ Channel set.", ephemeral: true });

    case "message":
      guildCfg[g.id].embedLines = int.options.getString("text")
        .replace(/\\{nl\\}/g, "\\n")
        .split(/\\n/);
      saveJSON(CONFIG_FILE, guildCfg);
      return int.reply({ content: "✅ Embed body updated.", ephemeral: true });

    case "resetping":
      pinged[g.id] = [];
      saveJSON(PING_FILE, pinged);
      return int.reply({ content: "✅ Ping memory cleared for this guild.", ephemeral: true });
  }
});

// ────────────────────────── LOGIN ──────────────────────────
client.login(TOKEN);

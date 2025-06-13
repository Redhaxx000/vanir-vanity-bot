/**
 * Discord Vanity-Role Bot  ●  https://github.com/
 * - Grants a role the first time a member’s custom-status, bio, or pronouns
 *   contains the vanity tag (default “/vanir”).
 * - Pings + embeds ONCE per user (persists across restarts).
 * - All role/channel/message settings done via slash commands, not env vars.
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

// ─────────────── ENV (only token & app ID needed) ───────────────
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const PORT = process.env.PORT || 3000;

// ─────────────── Disk persistence ───────────────
const PING_FILE = "./pinged.json";          // { guildId: [userIds] }
const CFG_FILE  = "./guild_config.json";    // { guildId: { roleId, channelId, embedLines[] } }

function loadJSON(path, fallback) {
  try { return fs.existsSync(path) ? JSON.parse(fs.readFileSync(path)) : fallback; }
  catch { return fallback; }
}
function saveJSON(path, data) {
  try { fs.writeFileSync(path, JSON.stringify(data, null, 2)); } catch {/* ignore */}
}

const pinged   = loadJSON(PING_FILE, {});   // remember pings
const guildCfg = loadJSON(CFG_FILE,  {});   // per-guild config

// ─────────────── Keep-alive for Render ───────────────
http.createServer((_, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Bot is running\n");
}).listen(PORT, () => console.log("🌐 Keep-alive server on " + PORT));

// ─────────────── Slash command schema ───────────────
const slash = new SlashCommandBuilder()
  .setName("vanity")
  .setDescription("Vanity-role bot controls (Manage Server)")
  .addSubcommand(s =>
    s.setName("role").setDescription("Set the role to give")
      .addRoleOption(o => o.setName("role").setDescription("Role").setRequired(true)))
  .addSubcommand(s =>
    s.setName("channel").setDescription("Set the announcement channel")
      .addChannelOption(o => o.setName("channel").setDescription("Channel").setRequired(true)))
  .addSubcommand(s =>
    s.setName("message").setDescription("Set embed body")
      .addStringOption(o => o.setName("text").setDescription("Use \\n or {nl} for breaks").setRequired(true)))
  .addSubcommand(s => s.setName("resetping").setDescription("Clear already-pinged list"));

const rest = new REST({ version: "10" }).setToken(TOKEN);

// ─────────────── Discord client ───────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
  ],
  partials: [Partials.GuildMember, Partials.User],
});

client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  for (const [gid] of client.guilds.cache)
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, gid), { body: [slash.toJSON()] });
  console.log("✅ Slash commands registered");
});

// ─────────────── Helpers ───────────────
const VANITY = "/vanir";   // hard-coded tag; change here if needed

async function profileHasTag(user, tag) {
  try {
    // Force-fetch to get bio/pronouns (requires bot privileged scope on Discord ≥ 2024-Q4)
    const prof = await user.fetch(true);
    const bio = prof.bio?.toLowerCase() || "";
    const pron = prof.pronouns?.toLowerCase() || "";
    return bio.includes(tag) || pron.includes(tag);
  } catch { return false; }
}

// ─────────────── Presence handler ───────────────
client.on("presenceUpdate", async (_old, pres) => {
  const g = pres?.guild;
  if (!g) return;

  const cfg = guildCfg[g.id];
  if (!cfg?.roleId || !cfg?.channelId) return;            // not configured yet

  const member = await g.members.fetch(pres.userId);
  const custom = pres.activities.find(a => a.type === ActivityType.Custom && a.state);
  const tagInStatus = custom && custom.state.toLowerCase().includes(VANITY);
  const tagInProfile = await profileHasTag(member.user, VANITY);
  const tagPresent = tagInStatus || tagInProfile;

  const hasRole = member.roles.cache.has(cfg.roleId);
  const wasPinged = (pinged[g.id] ?? []).includes(member.id);

  // Give role & announce once
  if (tagPresent && !hasRole) {
    await member.roles.add(cfg.roleId, "Vanity detected");
    if (!wasPinged) {
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
        await ch.send({ content: `${member} has repped **${VANITY}**`, embeds: [embed] });
      }
      pinged[g.id] = [...(pinged[g.id] ?? []), member.id];
      saveJSON(PING_FILE, pinged);
    }
  }

  // Remove role if tag completely gone (status + profile)
  if (hasRole && !tagPresent && custom) {
    await member.roles.remove(cfg.roleId, "Vanity removed");
  }
});

// ─────────────── Slash command handler ───────────────
client.on("interactionCreate", async int => {
  if (!int.isChatInputCommand() || int.commandName !== "vanity") return;

  if (!int.member.permissions.has(PermissionsBitField.Flags.ManageGuild))
    return int.reply({ content: "You need **Manage Server**.", ephemeral: true });

  const g = int.guild;
  guildCfg[g.id] = guildCfg[g.id] ?? {};

  switch (int.options.getSubcommand()) {
    case "role":
      guildCfg[g.id].roleId = int.options.getRole("role").id;
      saveJSON(CFG_FILE, guildCfg);
      return int.reply({ content: "✅ Role set.", ephemeral: true });

    case "channel":
      guildCfg[g.id].channelId = int.options.getChannel("channel").id;
      saveJSON(CFG_FILE, guildCfg);
      return int.reply({ content: "✅ Channel set.", ephemeral: true });

    case "message":
      guildCfg[g.id].embedLines = int.options.getString("text")
        .replace(/\\{nl\\}/g, "\\n")
        .split(/\\n/);
      saveJSON(CFG_FILE, guildCfg);
      return int.reply({ content: "✅ Embed updated.", ephemeral: true });

    case "resetping":
      pinged[g.id] = [];
      saveJSON(PING_FILE, pinged);
      return int.reply({ content: "✅ Ping memory cleared.", ephemeral: true });
  }
});

// ─────────────── Login ───────────────
client.login(TOKEN);

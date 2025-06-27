// index.js – Final Stable Version for Vanity Bot import { Client, GatewayIntentBits, ActivityType, Partials, EmbedBuilder, PermissionsBitField, REST, Routes, SlashCommandBuilder, } from "discord.js"; import fs from "fs"; import http from "http"; import "dotenv/config";

const TOKEN = process.env.DISCORD_TOKEN; const CLIENT_ID = process.env.CLIENT_ID; const PORT = process.env.PORT || 3000;

if (!TOKEN || !CLIENT_ID) throw new Error("Missing DISCORD_TOKEN or CLIENT_ID");

const CFG_FILE = "guilds.json"; const PING_FILE = "pinged.json";

const cfg = loadJSON(CFG_FILE); const pinged = loadJSON(PING_FILE);

function loadJSON(path) { try { return fs.existsSync(path) ? JSON.parse(fs.readFileSync(path, "utf8")) : {}; } catch { return {}; } }

function saveJSON(path, data) { try { fs.writeFileSync(path, JSON.stringify(data, null, 2)); } catch {} }

const TAG = "/vanir"; const GRAY = 0x2f3136; const defLines = [ "_ _     thank you for repping us    　  𓂃 　 ", "> pic perms", "> sticker perms", "> cam perms", ];

http.createServer((_, res) => res.end("alive\n")).listen(PORT, () => console.log("🌐 Keep-alive on", PORT) );

const client = new Client({ intents: [ GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildPresences, ], partials: [Partials.GuildMember, Partials.User], });

const slash = new SlashCommandBuilder() .setName("vanity") .setDescription("Vanity-bot setup (Manage Server)") .addSubcommand(s => s.setName("role") .setDescription("Set role to give") .addRoleOption(o => o.setName("role").setDescription("Role").setRequired(true)) ) .addSubcommand(s => s.setName("channel") .setDescription("Set announce channel") .addChannelOption(o => o.setName("channel").setDescription("Channel").setRequired(true)) ) .addSubcommand(s => s.setName("message") .setDescription("Set embed body (use \n)") .addStringOption(o => o.setName("text").setDescription("Body").setRequired(true)) ) .addSubcommand(s => s.setName("resetping").setDescription("Clear ping memory") );

client.once("ready", async () => { console.log(✅ Logged in as ${client.user.tag}); const rest = new REST({ version: "10" }).setToken(TOKEN); for (const [gid] of client.guilds.cache) { await rest.put(Routes.applicationGuildCommands(CLIENT_ID, gid), { body: [slash.toJSON()], }); } console.log("✅ Slash commands registered"); });

async function processMember(member, tagPresent, via) { const g = member.guild; const gc = cfg[g.id]; if (!gc?.roleId || !gc?.channelId) return;

const hasRole = member.roles.cache.has(gc.roleId); const pingMem = pinged[g.id] ?? []; const wasPinged = pingMem.includes(member.id);

console.log([${via}] ${member.user.tag} | ${tagPresent ? "rep" : "unrep"});

if (tagPresent) { if (!hasRole) await member.roles.add(gc.roleId).catch(console.error); if (!wasPinged) { const ch = g.channels.cache.get(gc.channelId); if (ch?.isTextBased()) { const embed = new EmbedBuilder() .setColor(GRAY) .setThumbnail(g.iconURL()) .setAuthor({ name: member.user.username, iconURL: member.user.displayAvatarURL(), }) .setDescription((gc.embedLines ?? defLines).join("\n")) .setFooter({ text: "rep /vanir in your status for perks" }) .setTimestamp(); ch.send({ content: ${member} has repped **${TAG}** *(via ${via})*, embeds: [embed] }); } pingMem.push(member.id); pinged[g.id] = pingMem; saveJSON(PING_FILE, pinged); } } else if (hasRole) { await member.roles.remove(gc.roleId).catch(console.error); } }

client.on("presenceUpdate", async (_old, pres) => { const g = pres?.guild; if (!g) return; const custom = pres.activities.find(a => a.type === ActivityType.Custom && a.state); const statusHasTag = custom && custom.state.toLowerCase().includes(TAG); const member = g.members.cache.get(pres.userId) || await g.members.fetch({ user: pres.userId, withPresences: true }); await processMember(member, statusHasTag, "status"); });

client.on("userUpdate", async (_oldU, newU) => { const bio = (newU.bio || "").toLowerCase(); const pro = (newU.pronouns || "").toLowerCase(); const tagPresent = bio.includes(TAG) || pro.includes(TAG); for (const [, g] of client.guilds.cache) { const m = g.members.cache.get(newU.id) || await g.members.fetch(newU.id).catch(() => null); if (m) await processMember(m, tagPresent, bio.includes(TAG) ? "bio" : "pronouns"); } });

client.on("interactionCreate", async i => { if (!i.isChatInputCommand() || i.commandName !== "vanity") return; if (!i.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) return i.reply({ content: "Need Manage Server", ephemeral: true }); const g = i.guild; cfg[g.id] ??= {}; switch (i.options.getSubcommand()) { case "role": cfg[g.id].roleId = i.options.getRole("role").id; saveJSON(CFG_FILE, cfg); return i.reply("✅ Role set."); case "channel": cfg[g.id].channelId = i.options.getChannel("channel").id; saveJSON(CFG_FILE, cfg); return i.reply("✅ Channel set."); case "message": cfg[g.id].embedLines = i.options.getString("text").replace(/\n/g, "\n").split(/\n/); saveJSON(CFG_FILE, cfg); return i.reply("✅ Embed updated."); case "resetping": pinged[g.id] = []; saveJSON(PING_FILE, pinged); return i.reply("✅ Ping memory cleared."); } });

// Scan every 10 min to fix missed events setInterval(async () => { for (const [gid, g] of client.guilds.cache) { const gc = cfg[gid]; if (!gc?.roleId || !gc?.channelId) continue; const members = await g.members.fetch(); for (const [, m] of members) { const bio = (m.user.bio || "").toLowerCase(); const pro = (m.user.pronouns || "").toLowerCase(); const pres = m.presence?.activities.find(a => a.type === ActivityType.Custom && a.state); const stat = pres?.state?.toLowerCase() ?? ""; const tagPresent = bio.includes(TAG) || pro.includes(TAG) || stat.includes(TAG); await processMember(m, tagPresent, "scan"); } } }, 1000 * 60 * 10);

client.login(TOKEN);


/********************************************************************
 * Discord Vanity Bot – 2025-06 bio-aware build
 * --------------------------------------------
 * • Detects vanity tag “/vanir” in:
 *     - Custom status (presenceUpdate)
 *     - Bio / pronouns (userUpdate)
 * • Gives role, pings once, persists pinged list
 * • All config via slash /vanity …
 *******************************************************************/

import {
  Client,
  GatewayIntentBits,
  ActivityType,
  Partials,
  EmbedBuilder,
  PermissionsBitField,
  REST,
  Routes,
  SlashCommandBuilder,
} from "discord.js";
import fs from "fs";
import http from "http";
import "dotenv/config";

/*─────────────────────── ENV ───────────────────────*/
const TOKEN     = process.env.DISCORD_TOKEN;   // bot token
const CLIENT_ID = process.env.CLIENT_ID;       // application ID
const PORT      = process.env.PORT || 3000;    // Render-provided or 3000 local
if (!TOKEN || !CLIENT_ID) throw new Error("DISCORD_TOKEN or CLIENT_ID missing");

/*──────────────── File persistence ─────────────────*/
const CFG_FILE  = "guilds.json";   // per-guild config
const PING_FILE = "pinged.json";   // per-guild ping memory

function load(path) {
  try { return fs.existsSync(path) ? JSON.parse(fs.readFileSync(path,"utf8")) : {}; }
  catch { return {}; }
}
function save(path, obj) {
  try { fs.writeFileSync(path, JSON.stringify(obj, null, 2)); } catch {}
}

const cfg    = load(CFG_FILE);
const pinged = load(PING_FILE);

/*──────────────── Constants ─────────────────*/
const TAG = "/vanir";
const GRAY = 0x2f3136;
const defLines = [
  "_ _     thank you for repping us    　  𓂃 　 ",
  "> **pic** __perms__",
  "> **sticker** __perms__",
  "> **cam** __perms__",
];

/*──────────────── Keep-alive (Render) ─────────────────*/
http.createServer((_,res)=>res.end("alive\n")).listen(PORT, ()=>console.log("🌐 Up on", PORT));

/*──────────────── Client ─────────────────*/
const client = new Client({
  intents:[
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
  ],
  partials:[Partials.GuildMember, Partials.User],
});

/*──────────────── Slash schema ─────────────────*/
const slash = new SlashCommandBuilder()
  .setName("vanity").setDescription("Vanity bot setup (Manage Server)")
  .addSubcommand(s=>s.setName("role").setDescription("Role to give")
      .addRoleOption(o=>o.setName("role").setDescription("Role").setRequired(true)))
  .addSubcommand(s=>s.setName("channel").setDescription("Channel to announce")
      .addChannelOption(o=>o.setName("channel").setDescription("Channel").setRequired(true)))
  .addSubcommand(s=>s.setName("message").setDescription("Set embed body (\\n)")
      .addStringOption(o=>o.setName("text").setDescription("Body").setRequired(true)))
  .addSubcommand(s=>s.setName("resetping").setDescription("Clear ping memory"));

client.once("ready", async ()=>{
  console.log(`✅ Logged in as ${client.user.tag}`);
  const rest = new REST({version:"10"}).setToken(TOKEN);
  for (const [gid] of client.guilds.cache)
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, gid), { body:[slash.toJSON()] });
  console.log("✅ Slash commands registered");
});

/*──────────────── Helper ─────────────────*/
async function handleVanity(member, bioSource = "status") {
  const g = member.guild;
  const gc = cfg[g.id];
  if (!gc?.roleId || !gc?.channelId) return;

  const hasRole = member.roles.cache.has(gc.roleId);
  const pingMem = pinged[g.id] ?? [];
  const wasPinged = pingMem.includes(member.id);

  if (!hasRole) {
    await member.roles.add(gc.roleId).catch(console.error);

    if (!wasPinged) {
      const ch = g.channels.cache.get(gc.channelId);
      if (ch?.isTextBased()) {
        const lines = gc.embedLines ?? defLines;
        const embed = new EmbedBuilder()
          .setColor(GRAY)
          .setThumbnail(g.iconURL())
          .setAuthor({ name: member.user.username, iconURL: member.user.displayAvatarURL() })
          .setDescription(lines.join("\n"))
          .setFooter({ text: "rep /vanir in your status for perks" })
          .setTimestamp();
        ch.send({ content:`${member} has repped **${TAG}** *(via ${bioSource})*`, embeds:[embed] });
      }
      pingMem.push(member.id);
      pinged[g.id] = pingMem;
      save(PING_FILE, pinged);
    }
  }
}

/*──────────────── Presence (status) ─────────────────*/
client.on("presenceUpdate", async(_old,pres)=>{
  const g = pres?.guild; if(!g) return;
  const custom = pres.activities.find(a=>a.type===ActivityType.Custom && a.state);
  if (!custom || !custom.state.toLowerCase().includes(TAG)) return;

  const member = g.members.cache.get(pres.userId) ||
                 await g.members.fetch({user:pres.userId, withPresences:true});
  handleVanity(member, "status");
});

/*──────────────── User profile (bio / pronouns) ─────────────────*/
client.on("userUpdate", async (_oldU, newU) => {
  // Check bio/pronouns for tag
  const bio  = (newU.bio      || "").toLowerCase();
  const pro  = (newU.pronouns || "").toLowerCase();
  if (!bio.includes(TAG) && !pro.includes(TAG)) return;

  // Iterate mutual guilds
  for (const [gid, g] of client.guilds.cache) {
    const member = g.members.cache.get(newU.id) || null;
    if (member) handleVanity(member, bio.includes(TAG) ? "bio" : "pronouns");
  }
});

/*──────────────── Slash logic ─────────────────*/
client.on("interactionCreate", async i=>{
  if(!i.isChatInputCommand() || i.commandName!=="vanity") return;
  if(!i.member.permissions.has(PermissionsBitField.Flags.ManageGuild))
    return i.reply({content:"Need Manage Server",ephemeral:true});

  const g=i.guild; cfg[g.id]??={};
  const sub=i.options.getSubcommand();

  if(sub==="role"){
    cfg[g.id].roleId=i.options.getRole("role").id; save(CFG_FILE,cfg);
    return i.reply("✅ Role set.");
  }
  if(sub==="channel"){
    cfg[g.id].channelId=i.options.getChannel("channel").id; save(CFG_FILE,cfg);
    return i.reply("✅ Channel set.");
  }
  if(sub==="message"){
    cfg[g.id].embedLines=i.options.getString("text").replace(/\\{nl\\}/g,"\n").split(/\n/);
    save(CFG_FILE,cfg); return i.reply("✅ Embed updated.");
  }
  if(sub==="resetping"){
    pinged[g.id]=[]; save(PING_FILE,pinged); return i.reply("✅ Ping list cleared.");
  }
});

/*──────────────── Login ─────────────────*/
client.login(TOKEN);

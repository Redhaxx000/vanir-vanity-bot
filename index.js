/********************************************************************
 * Discord Vanity Bot  •  2025-06 final build
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

/*────────── ENV ──────────*/
const TOKEN     = process.env.DISCORD_TOKEN; // bot token
const CLIENT_ID = process.env.CLIENT_ID;    // application / bot ID
const PORT      = process.env.PORT || 3000; // Render injects PORT
if (!TOKEN || !CLIENT_ID) throw Error("Set DISCORD_TOKEN & CLIENT_ID env vars!");

/*────────── Persistence ──────────*/
const CFG_FILE  = "guilds.json"; // per-guild settings
const PING_FILE = "pinged.json"; // per-guild ping memory
const cfg    = loadJSON(CFG_FILE);
const pinged = loadJSON(PING_FILE);
function loadJSON(p){try{return fs.existsSync(p)?JSON.parse(fs.readFileSync(p,"utf8")):{};}catch{return {};}}
function saveJSON(p,d){try{fs.writeFileSync(p,JSON.stringify(d,null,2));}catch{}}

/*────────── Constants ──────────*/
const TAG      = "/vanir";
const GRAY     = 0x2f3136;
const defLines = [
  "_ _     thank you for repping us    　  𓂃 　 ",
  "> **pic** __perms__",
  "> **sticker** __perms__",
  "> **cam** __perms__",
];

/*────────── Keep-alive (Render) ──────────*/
http.createServer((_,res)=>res.end("alive\n"))
    .listen(PORT, ()=>console.log("🌐 Keep-alive on", PORT));

/*────────── Client ──────────*/
const client = new Client({
  intents:[
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
  ],
  partials:[Partials.GuildMember, Partials.User],
});

/*────────── Slash /vanity … ──────────*/
const slash = new SlashCommandBuilder()
  .setName("vanity").setDescription("Vanity-bot setup (Manage Server)")
  .addSubcommand(s=>s.setName("role").setDescription("Set role to give")
      .addRoleOption(o=>o.setName("role").setDescription("Role").setRequired(true)))
  .addSubcommand(s=>s.setName("channel").setDescription("Set announce channel")
      .addChannelOption(o=>o.setName("channel").setDescription("Channel").setRequired(true)))
  .addSubcommand(s=>s.setName("message").setDescription("Set embed body (use \\n)")
      .addStringOption(o=>o.setName("text").setDescription("Body").setRequired(true)))
  .addSubcommand(s=>s.setName("resetping").setDescription("Clear ping memory"));

client.once("ready", async ()=>{
  console.log(`✅ Logged in as ${client.user.tag}`);
  const rest = new REST({version:"10"}).setToken(TOKEN);
  for (const [gid] of client.guilds.cache){
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, gid), { body:[slash.toJSON()] });
  }
  console.log("✅ Slash commands registered");
});

/*────────── Core helper (grant / remove / ping once) ──────────*/
async function processMember(member, tagPresent, via){
  const g  = member.guild;
  const gc = cfg[g.id]; if(!gc?.roleId||!gc?.channelId) return;

  const hasRole    = member.roles.cache.has(gc.roleId);
  const pingMem    = pinged[g.id] ?? [];
  const wasPinged  = pingMem.includes(member.id);

  /*—— Grant & ping ——*/
  if (tagPresent){
    if (!hasRole) await member.roles.add(gc.roleId).catch(console.error);
    if (!wasPinged){
      const ch = g.channels.cache.get(gc.channelId);
      if (ch?.isTextBased()){
        const embed = new EmbedBuilder()
          .setColor(GRAY)
          .setThumbnail(g.iconURL())
          .setAuthor({ name: member.user.username, iconURL: member.user.displayAvatarURL() })
          .setDescription((gc.embedLines ?? defLines).join("\n"))
          .setFooter({ text: "rep /vanir in your status for perks" })
          .setTimestamp();
        ch.send({ content:`${member} has repped **${TAG}** *(via ${via})*`, embeds:[embed] });
      }
      pingMem.push(member.id);
      pinged[g.id] = pingMem;
      saveJSON(PING_FILE, pinged);
    }
  }
  /*—— Remove role if tag gone everywhere ——*/
  else if (hasRole){
    await member.roles.remove(gc.roleId).catch(console.error);
    // don’t erase ping memory – user won’t be pinged again until resetping
  }
}

/*────────── Presence: custom-status watcher ──────────*/
client.on("presenceUpdate", async (_old, pres)=>{
  const g = pres?.guild; if(!g) return;
  const custom = pres.activities.find(a=>a.type===ActivityType.Custom && a.state);
  const statusHasTag = custom && custom.state.toLowerCase().includes(TAG);

  const member = g.members.cache.get(pres.userId) ||
                 await g.members.fetch({ user: pres.userId, withPresences:true });
  await processMember(member, statusHasTag, "status");
});

/*────────── Profile (bio/pronouns) watcher ──────────*/
client.on("userUpdate", async (_oldU, newU)=>{
  const bio = (newU.bio || "").toLowerCase();
  const pro = (newU.pronouns || "").toLowerCase();
  const tagPresent = bio.includes(TAG) || pro.includes(TAG);

  for (const [, g] of client.guilds.cache){
    const m = g.members.cache.get(newU.id) || await g.members.fetch(newU.id).catch(()=>null);
    if (m) await processMember(m, tagPresent, bio.includes(TAG)?"bio":"pronouns");
  }
});

/*────────── Slash handler ──────────*/
client.on("interactionCreate", async i=>{
  if(!i.isChatInputCommand()||i.commandName!=="vanity")return;
  if(!i.member.permissions.has(PermissionsBitField.Flags.ManageGuild))
    return i.reply({content:"Need Manage Server",ephemeral:true});

  const g=i.guild; cfg[g.id]??={};
  switch(i.options.getSubcommand()){
    case"role":
      cfg[g.id].roleId=i.options.getRole("role").id; saveJSON(CFG_FILE,cfg);
      return i.reply("✅ Role set.");
    case"channel":
      cfg[g.id].channelId=i.options.getChannel("channel").id; saveJSON(CFG_FILE,cfg);
      return i.reply("✅ Channel set.");
    case"message":
      cfg[g.id].embedLines=i.options.getString("text").replace(/\\{nl\\}/g,"\n").split(/\n/);
      saveJSON(CFG_FILE,cfg);return i.reply("✅ Embed updated.");
    case"resetping":
      pinged[g.id]=[]; saveJSON(PING_FILE,pinged);return i.reply("✅ Ping memory cleared.");
  }
});

/*────────── Login ──────────*/
client.login(TOKEN);

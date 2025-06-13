import {
  Client,
  GatewayIntentBits,
  ActivityType,
  Partials,
  EmbedBuilder,
  REST,
  Routes,
  SlashCommandBuilder,
} from "discord.js";
import fs from "fs";
import http from "http";
import "dotenv/config";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.GuildMember, Partials.User],
});

const VANITY = "/vanir";
const CFG_FILE = "guilds.json";
const PING_FILE = "pinged.json";

let guildCfg = loadJSON(CFG_FILE);
let pinged = loadJSON(PING_FILE);

// Load JSON or fallback
function loadJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return {};
  }
}
function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// Keep-alive server for Render
const PORT = process.env.PORT || 3000;
http.createServer((_, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Bot is running\n");
}).listen(PORT, () => console.log(`🌐 Keep-alive on ${PORT}`));

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.on("presenceUpdate", async (_old, pres) => {
  const g = pres?.guild;
  if (!g) return;

  const cfg = guildCfg[g.id];
  if (!cfg?.roleId || !cfg?.channelId) return;

  const member = g.members.cache.get(pres.userId) ||
                 await g.members.fetch({ user: pres.userId, withPresences: true });

  const custom = pres.activities.find(a => a.type === ActivityType.Custom && a.state);
  const tagInStatus = custom && custom.state.toLowerCase().includes(VANITY);
  let tagOverall = tagInStatus;

  if (!tagOverall) {
    try {
      const profile = await member.user.fetch(true);
      const bio  = profile.bio?.toLowerCase()     || "";
      const pron = profile.pronouns?.toLowerCase() || "";
      tagOverall = bio.includes(VANITY) || pron.includes(VANITY);
    } catch {}
  }

  const hasRole   = member.roles.cache.has(cfg.roleId);
  const wasPinged = (pinged[g.id] ?? []).includes(member.id);

  if (tagOverall && !hasRole) {
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
          .setAuthor({ name: member.user.username, iconURL: member.user.displayAvatarURL() })
          .setDescription(lines.join("\n"))
          .setFooter({ text: "rep /vanir in your status for perks" })
          .setTimestamp();

        await ch.send({ content: `${member} has repped **${VANITY}**`, embeds: [embed] });
      }
      pinged[g.id] = [...(pinged[g.id] ?? []), member.id];
      saveJSON(PING_FILE, pinged);
    }
  }

  if (hasRole && !tagOverall && custom) {
    await member.roles.remove(cfg.roleId, "Vanity removed");
  }
});

client.on("interactionCreate", async (i) => {
  if (!i.isChatInputCommand()) return;

  const gid = i.guildId;
  guildCfg[gid] ??= {};

  switch (i.commandName) {
    case "vanity":
      const sub = i.options.getSubcommand();
      if (sub === "role") {
        const role = i.options.getRole("role");
        guildCfg[gid].roleId = role.id;
        saveJSON(CFG_FILE, guildCfg);
        await i.reply("✅ Role set.");
      } else if (sub === "channel") {
        const ch = i.options.getChannel("channel");
        guildCfg[gid].channelId = ch.id;
        saveJSON(CFG_FILE, guildCfg);
        await i.reply("✅ Channel set.");
      } else if (sub === "message") {
        const text = i.options.getString("embed_lines");
        const lines = text.split("$v");
        guildCfg[gid].embedLines = lines;
        saveJSON(CFG_FILE, guildCfg);
        await i.reply("✅ Embed content updated.");
      } else if (sub === "resetping") {
        pinged[gid] = [];
        saveJSON(PING_FILE, pinged);
        await i.reply("✅ Ping list cleared.");
      }
      break;
  }
});

async function registerCommands() {
  const cmds = [
    new SlashCommandBuilder()
      .setName("vanity")
      .setDescription("Vanity bot setup")
      .addSubcommand(s =>
        s.setName("role").setDescription("Set role to give")
         .addRoleOption(o => o.setName("role").setDescription("Role").setRequired(true)))
      .addSubcommand(s =>
        s.setName("channel").setDescription("Set channel to send embed")
         .addChannelOption(o => o.setName("channel").setDescription("Channel").setRequired(true)))
      .addSubcommand(s =>
        s.setName("message").setDescription("Set embed body")
         .addStringOption(o => o.setName("embed_lines").setDescription("Use $v to split lines").setRequired(true)))
      .addSubcommand(s =>
        s.setName("resetping").setDescription("Allow re-ping")),
  ];
  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);
  await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), {
    body: cmds.map(c => c.toJSON()),
  });
  console.log("✅ Slash commands registered");
}

registerCommands();
client.login(process.env.TOKEN);

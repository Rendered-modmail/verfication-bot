import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
  StringSelectMenuBuilder
} from "discord.js";
import { config } from "./config.js";
import { addGuildMember, refreshAccessToken } from "./discordApi.js";
import { createOAuthServer } from "./oauthServer.js";
import { createOAuthState } from "./state.js";
import { JsonStore } from "./store.js";

const store = new JsonStore(config.dataFile);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

const commands = [
  new SlashCommandBuilder()
    .setName("setupverify")
    .setDescription("Send the verification dropdown panel.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Where to send the verification panel.")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName("sjoin")
    .setDescription("Add consenting, authorized users to an allowed server.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addIntegerOption((option) =>
      option
        .setName("amount")
        .setDescription("Number of authorized users to try.")
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("server_id")
        .setDescription("Target server ID. The bot must be in this server.")
        .setRequired(true)
    )
    .addUserOption((option) =>
      option
        .setName("member")
        .setDescription("Optional: choose one verified member to add instead of using amount.")
        .setRequired(false)
    )
].map((command) => command.toJSON());

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(config.token);

  if (config.commandGuildId) {
    await rest.put(Routes.applicationGuildCommands(config.clientId, config.commandGuildId), { body: commands });
    console.log(`Registered commands to guild ${config.commandGuildId}.`);
    return;
  }

  await rest.put(Routes.applicationCommands(config.clientId), { body: commands });
  console.log("Registered global commands.");
}

function buildOAuthUrl({ state }) {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "identify guilds.join",
    state
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function canUseSjoin(userId) {
  if (config.allowedUserIds.size === 0) return false;
  return config.allowedUserIds.has(userId);
}

async function getFreshAccessToken(userRecord) {
  if (userRecord.expiresAt > Date.now() + 60_000) {
    return userRecord.accessToken;
  }

  const refreshed = await refreshAccessToken(userRecord.refreshToken);
  store.updateUserToken(userRecord.userId, refreshed);
  await store.save();
  return refreshed.access_token;
}

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
});

client.on(Events.GuildMemberAdd, async (member) => {
  try {
    if (member.user.bot) return;
    if (config.commandGuildId && member.guild.id !== config.commandGuildId) return;

    await member.roles.add(config.unverifiedRoleId, "New member joined before verification");
  } catch (error) {
    console.error(`Failed to add unverified role to ${member.user.id}:`, error);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === "setupverify") {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({ content: "You need Manage Server to use this command.", ephemeral: true });
        return;
      }

      const channel = interaction.options.getChannel("channel") ?? interaction.channel;
      if (!channel || channel.type !== ChannelType.GuildText) {
        await interaction.reply({ content: "Pick a normal text channel for the verification panel.", ephemeral: true });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle("Server Verification")
        .setDescription("Select the option below to verify with Discord OAuth. Discord will show the requested permissions before you continue.")
        .setColor(0x5865f2);

      const menu = new StringSelectMenuBuilder()
        .setCustomId("verify_select")
        .setPlaceholder("Choose a verification option")
        .addOptions([
          {
            label: "Verify account",
            description: "Authorize Discord and receive the verified role.",
            value: "verify"
          }
        ]);

      await channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] });
      await interaction.reply({ content: `Verification panel sent to ${channel}.`, ephemeral: true });
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === "verify_select") {
      if (!interaction.values.includes("verify")) return;

      const state = createOAuthState({
        discordUserId: interaction.user.id,
        guildId: interaction.guildId
      });

      const button = new ButtonBuilder()
        .setLabel("Authorize verification")
        .setStyle(ButtonStyle.Link)
        .setURL(buildOAuthUrl({ state }));

      await interaction.reply({
        content: "Click the button to open Discord OAuth and finish verification.",
        components: [new ActionRowBuilder().addComponents(button)],
        ephemeral: true
      });
      return;
    }

    if (interaction.isChatInputCommand() && interaction.commandName === "sjoin") {
      if (!canUseSjoin(interaction.user.id)) {
        await interaction.reply({ content: "You are not allowed to use `/sjoin`.", ephemeral: true });
        return;
      }

      const amount = interaction.options.getInteger("amount", true);
      const targetGuildId = interaction.options.getString("server_id", true);
      const selectedUser = interaction.options.getUser("member", false);

      await interaction.deferReply({ ephemeral: true });

      const targetGuild = await client.guilds.fetch(targetGuildId).catch(() => null);
      if (!targetGuild) {
        await interaction.editReply("The bot is not in that server, or the server ID is invalid.");
        return;
      }

      const selectedUserRecord = selectedUser ? store.getUser(selectedUser.id) : null;
      if (selectedUser && !selectedUserRecord) {
        await interaction.editReply(`${selectedUser.tag} has not completed OAuth verification yet.`);
        return;
      }

      const users = selectedUser ? [selectedUserRecord] : store.listUsers().slice(0, amount);
      let added = 0;
      let alreadyInServer = 0;
      let failed = 0;

      for (const userRecord of users) {
        try {
          const accessToken = await getFreshAccessToken(userRecord);
          const result = await addGuildMember({
            guildId: targetGuildId,
            userId: userRecord.userId,
            accessToken
          });

          if (result === null) {
            alreadyInServer += 1;
          } else {
            added += 1;
          }
        } catch (error) {
          failed += 1;
          if (error.status === 401 || error.status === 403) {
            store.deleteUser(userRecord.userId);
            await store.save();
          }
          console.error(`Failed to add ${userRecord.userId}:`, error);
        }

        await wait(config.sjoinDelayMs);
      }

      await interaction.editReply(`Finished /sjoin for ${targetGuild.name}: ${added} added, ${alreadyInServer} already there, ${failed} failed.`);
    }
  } catch (error) {
    console.error(error);
    const message = "Something went wrong while handling that interaction.";
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(message).catch(() => null);
    } else {
      await interaction.reply({ content: message, ephemeral: true }).catch(() => null);
    }
  }
});

await store.load();
await registerCommands();
await client.login(config.token);

const server = createOAuthServer({ client, store });
server.listen(config.port, () => {
  console.log(`OAuth callback server listening on ${config.publicBaseUrl}`);
});

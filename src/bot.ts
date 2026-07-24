import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  AttachmentBuilder,
  type Interaction,
  type Guild,
  type GuildMember,
  type TextChannel,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Message,
} from "discord.js";
import QRCode from "qrcode";
import { generatePixPayload } from "./pix.js";

// ─── Config ───────────────────────────────────────────────────────────────────
const TOKEN           = process.env["DISCORD_BOT_TOKEN"]!;
const GUILD_ID        = process.env["DISCORD_GUILD_ID"]!;
const PRODUCT_NAME    = process.env["PRODUCT_NAME"]    ?? "Produto";
const PRODUCT_PRICE   = parseFloat(process.env["PRODUCT_PRICE"] ?? "0");
const PRODUCT_IMAGE   = process.env["PRODUCT_IMAGE"]   ?? "";
const PIX_KEY         = process.env["PIX_KEY"]!;
const PIX_HOLDER_NAME = process.env["PIX_HOLDER_NAME"] ?? "Vendedor";
const PIX_CITY        = process.env["PIX_CITY"]        ?? "SAO PAULO";
const DOWNLOAD_CHANNEL_ID = process.env["DISCORD_DOWNLOAD_CHANNEL_ID"] ?? "";

// ─── Button IDs ───────────────────────────────────────────────────────────────
const BTN_OPEN_CHANNEL = "btn_open_channel";
const BTN_CONFIRM_BUY  = "btn_confirm_buy";
const BTN_CANCEL_BUY   = "btn_cancel_buy";
const BTN_PAID         = "btn_paid";

// ─── Estado em memória ────────────────────────────────────────────────────────
const activeChannels  = new Map<string, string>(); // userId  → channelId
const awaitingReceipt = new Map<string, string>(); // channelId → userId

// ─── Slash commands ───────────────────────────────────────────────────────────
const commands = [
  new SlashCommandBuilder()
    .setName("produto")
    .setDescription("Mostra o produto disponível para compra")
    .toJSON(),
];

// ─── Client ───────────────────────────────────────────────────────────────────
export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // Privileged — ativar no Discord Dev Portal
  ],
});

// ─── Ready ────────────────────────────────────────────────────────────────────
client.once("ready", async () => {
  console.log(`[Bot] Conectado como ${client.user?.tag}`);

  const rest = new REST({ version: "10" }).setToken(TOKEN);
  try {
    await rest.put(
      Routes.applicationGuildCommands(client.user!.id, GUILD_ID),
      { body: commands },
    );
    console.log("[Bot] Comandos slash registrados");
  } catch (err) {
    console.error("[Bot] Erro ao registrar comandos slash:", err);
  }
});

// ─── Detecta comprovante enviado pelo cliente ─────────────────────────────────
client.on("messageCreate", async (message: Message) => {
  if (message.author.bot) return;

  const buyerUserId = awaitingReceipt.get(message.channelId);
  if (!buyerUserId) return;
  if (message.author.id !== buyerUserId) return;
  if (message.attachments.size === 0) return;

  awaitingReceipt.delete(message.channelId);

  const embed = new EmbedBuilder()
    .setTitle("📎 Comprovante recebido!")
    .setDescription(
      `<@${buyerUserId}>, recebemos seu comprovante!\n\n` +
      `Clique no botão abaixo para liberar seu acesso ao produto:`,
    )
    .setColor(0x5865f2);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(BTN_PAID)
      .setLabel("✅ Já realizei o pagamento")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(BTN_CANCEL_BUY)
      .setLabel("❌ Cancelar")
      .setStyle(ButtonStyle.Danger),
  );

  await (message.channel as TextChannel).send({ embeds: [embed], components: [row] });
});

// ─── Interactions ─────────────────────────────────────────────────────────────
client.on("interactionCreate", async (interaction: Interaction) => {
  if (interaction.isChatInputCommand()) await handleSlashCommand(interaction);
  else if (interaction.isButton())       await handleButton(interaction);
});

// ─── /produto ─────────────────────────────────────────────────────────────────
async function handleSlashCommand(i: ChatInputCommandInteraction) {
  if (i.commandName !== "produto") return;

  const price = PRODUCT_PRICE.toLocaleString("pt-BR", {
    style: "currency", currency: "BRL",
  });

  const embed = new EmbedBuilder()
    .setTitle(`🛍️ ${PRODUCT_NAME}`)
    .setDescription(`**Preço:** ${price}`)
    .setColor(0x00b300)
    .setImage(PRODUCT_IMAGE)
    .setFooter({ text: "Clique no botão abaixo para realizar sua compra" });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(BTN_OPEN_CHANNEL)
      .setLabel("🛒 Realizar Compra")
      .setStyle(ButtonStyle.Success),
  );

  await i.reply({ embeds: [embed], components: [row] });
}

// ─── Button router ────────────────────────────────────────────────────────────
async function handleButton(i: ButtonInteraction) {
  switch (i.customId) {
    case BTN_OPEN_CHANNEL: await handleOpenChannel(i); break;
    case BTN_CONFIRM_BUY:  await handleConfirmBuy(i);  break;
    case BTN_CANCEL_BUY:   await handleCancelBuy(i);   break;
    case BTN_PAID:         await handlePaid(i);        break;
  }
}

// ─── Abre canal privado de compra ─────────────────────────────────────────────
async function handleOpenChannel(i: ButtonInteraction) {
  const guild  = i.guild as Guild;
  const member = i.member as GuildMember;
  const userId = member.user.id;

  const existingId = activeChannels.get(userId);
  if (existingId && guild.channels.cache.get(existingId)) {
    await i.reply({
      content: `Você já tem uma compra em andamento! Acesse <#${existingId}>`,
      ephemeral: true,
    });
    return;
  }
  activeChannels.delete(userId);
  await i.deferReply({ ephemeral: true });

  try {
    const channel = await guild.channels.create({
      name: `compra-${member.user.username}`,
      type: ChannelType.GuildText,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        {
          id: userId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
        {
          id: guild.members.me!.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
      ],
    });

    activeChannels.set(userId, channel.id);

    const price = PRODUCT_PRICE.toLocaleString("pt-BR", {
      style: "currency", currency: "BRL",
    });

    const embed = new EmbedBuilder()
      .setTitle(`🛒 Compra — ${PRODUCT_NAME}`)
      .setDescription(
        `Olá <@${userId}>! Você está prestes a comprar:\n\n` +
        `**${PRODUCT_NAME}**\n**Valor:** ${price}\n\n` +
        `Escolha uma das opções abaixo:`,
      )
      .setColor(0x5865f2)
      .setThumbnail(PRODUCT_IMAGE);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(BTN_CONFIRM_BUY)
        .setLabel("✅ Realizar Compra")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(BTN_CANCEL_BUY)
        .setLabel("❌ Cancelar Compra")
        .setStyle(ButtonStyle.Danger),
    );

    await (channel as TextChannel).send({
      content: `<@${userId}>`,
      embeds: [embed],
      components: [row],
    });

    await i.editReply({ content: `✅ Canal criado! Acesse <#${channel.id}>` });
  } catch (err) {
    console.error("[Bot] Erro ao criar canal:", err);
    await i.editReply({ content: "❌ Erro ao criar canal. Verifique permissões do bot." });
  }
}

// ─── Gera QR Code PIX e aguarda comprovante ───────────────────────────────────
async function handleConfirmBuy(i: ButtonInteraction) {
  await i.deferReply();
  const userId = (i.member as GuildMember).user.id;

  try {
    const payload = generatePixPayload({
      key: PIX_KEY,
      holderName: PIX_HOLDER_NAME,
      city: PIX_CITY,
      amount: PRODUCT_PRICE,
      txid: `COMPRA${Date.now()}`,
    });

    const qrBuffer = await QRCode.toBuffer(payload, {
      errorCorrectionLevel: "M",
      width: 512,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
    });

    const price = PRODUCT_PRICE.toLocaleString("pt-BR", {
      style: "currency", currency: "BRL",
    });

    const embed = new EmbedBuilder()
      .setTitle("💰 Pagamento via PIX")
      .setDescription(
        `Escaneie o QR Code com o app do seu banco:\n\n` +
        `**Valor:** ${price}\n\n` +
        `> 📋 **Código copia e cola:**\n\`\`\`\n${payload}\n\`\`\`\n` +
        `Após pagar, **envie o comprovante aqui** e o botão de confirmação aparecerá automaticamente. 📎`,
      )
      .setColor(0x00b300)
      .setImage("attachment://pix-qrcode.png")
      .setFooter({ text: "Envie o comprovante para liberar o acesso ao produto." });

    await i.message.edit({ components: [] });
    await i.editReply({
      embeds: [embed],
      files: [new AttachmentBuilder(qrBuffer, { name: "pix-qrcode.png" })],
    });

    awaitingReceipt.set(i.channelId, userId);
  } catch (err) {
    console.error("[Bot] Erro ao gerar QR Code:", err);
    await i.editReply({ content: "❌ Erro ao gerar o QR Code. Tente novamente." });
  }
}

// ─── Libera acesso ao canal de download ───────────────────────────────────────
async function handlePaid(i: ButtonInteraction) {
  await i.deferReply();

  const guild   = i.guild as Guild;
  const userId  = (i.member as GuildMember).user.id;
  const channel = i.channel as TextChannel;

  await i.message.edit({ components: [] });

  if (!DOWNLOAD_CHANNEL_ID) {
    await i.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle("⚠️ Entrega temporariamente indisponível")
          .setDescription(
            `<@${userId}>, comprovante recebido!\n\n` +
            `Entre em contato com um administrador para receber o acesso.`,
          )
          .setColor(0xffa500),
      ],
    });
    return;
  }

  try {
    const downloadChannel =
      guild.channels.cache.get(DOWNLOAD_CHANNEL_ID) ??
      await guild.channels.fetch(DOWNLOAD_CHANNEL_ID);

    if (!downloadChannel?.isTextBased()) {
      throw new Error("Canal de download não encontrado ou inválido");
    }

    await (downloadChannel as TextChannel).permissionOverwrites.edit(userId, {
      ViewChannel: true, ReadMessageHistory: true, SendMessages: false,
    });

    const embed = new EmbedBuilder()
      .setTitle("🎉 Acesso liberado!")
      .setDescription(
        `Obrigado pela sua compra, <@${userId}>! 🎮\n\n` +
        `Acesso liberado em: 👉 <#${DOWNLOAD_CHANNEL_ID}>\n\n` +
        `> ⚠️ Não compartilhe o acesso com ninguém.\n\n` +
        `Este canal fecha em **30 segundos**.`,
      )
      .setColor(0x00b300)
      .setFooter({ text: "Obrigado pela compra! Aproveite 🎮" });

    await i.editReply({ embeds: [embed] });

    activeChannels.delete(userId);
    setTimeout(async () => {
      try { await channel.delete("Compra concluída"); }
      catch (err) { console.error("[Bot] Erro ao fechar canal:", err); }
    }, 30_000);
  } catch (err) {
    console.error("[Bot] Erro ao liberar acesso:", err);
    await i.editReply({ content: "❌ Erro ao liberar acesso. Contate um administrador." });
  }
}

// ─── Cancela e fecha canal ────────────────────────────────────────────────────
async function handleCancelBuy(i: ButtonInteraction) {
  const userId  = (i.member as GuildMember).user.id;
  const channel = i.channel as TextChannel;

  await i.reply({ content: "⏳ Cancelando compra e fechando canal..." });

  activeChannels.delete(userId);
  awaitingReceipt.delete(channel.id);

  setTimeout(async () => {
    try { await channel.delete("Compra cancelada"); }
    catch (err) { console.error("[Bot] Erro ao deletar canal:", err); }
  }, 2_000);
}

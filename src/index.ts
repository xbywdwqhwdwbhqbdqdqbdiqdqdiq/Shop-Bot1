import "dotenv/config";
import { client } from "./bot.js";

const TOKEN = process.env["DISCORD_BOT_TOKEN"];

if (!TOKEN) {
  console.error("[Bot] DISCORD_BOT_TOKEN não definido. Configure o arquivo .env");
  process.exit(1);
}

if (!process.env["DISCORD_GUILD_ID"]) {
  console.error("[Bot] DISCORD_GUILD_ID não definido. Configure o arquivo .env");
  process.exit(1);
}

if (!process.env["PIX_KEY"]) {
  console.error("[Bot] PIX_KEY não definida. Configure o arquivo .env");
  process.exit(1);
}

client.login(TOKEN).catch((err) => {
  console.error("[Bot] Falha ao conectar ao Discord:", err);
  process.exit(1);
});

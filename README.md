# 🤖 Shop-Bot — Discord Sales Bot

Bot de vendas para Discord com QR Code PIX e entrega automática por comprovante.

## Funcionalidades

- `/produto` — exibe produto com foto, preço e botão de compra
- Canal privado criado automaticamente para cada comprador
- QR Code PIX gerado dinamicamente
- Detecção automática de comprovante (imagem enviada no canal)
- Liberação automática de acesso ao canal de download após confirmação
- Cancelamento com fechamento automático do canal

## Início rápido

```bash
# 1. Instalar dependências
npm install

# 2. Configurar variáveis de ambiente
cp .env.example .env
# Edite o .env com seus dados

# 3. Build
npm run build

# 4. Iniciar
npm start
```

## Variáveis de ambiente

| Variável | Descrição |
|----------|-----------|
| `DISCORD_BOT_TOKEN` | Token do bot (Dev Portal → Bot → Token) |
| `DISCORD_GUILD_ID` | ID do servidor Discord |
| `PRODUCT_NAME` | Nome do produto |
| `PRODUCT_PRICE` | Preço em reais (ex: `19.99`) |
| `PRODUCT_IMAGE` | URL da imagem do produto |
| `PIX_KEY` | Chave PIX |
| `PIX_HOLDER_NAME` | Nome do titular PIX |
| `PIX_CITY` | Cidade do titular (ex: `SAO PAULO`) |
| `DISCORD_DOWNLOAD_CHANNEL_ID` | ID do canal com o download do produto |

## Intents necessários (Discord Dev Portal)

Bot → Privileged Gateway Intents:
- ✅ **Message Content Intent**

## Deploy

### Railway / Render
1. Suba este repositório no GitHub
2. Conecte à plataforma
3. Configure as variáveis de ambiente
4. Start command: `npm run build && npm start`

### Docker
```bash
npm run build
docker build -t shop-bot .
docker run --env-file .env shop-bot
```

### VPS com PM2
```bash
npm install
npm run build
npm install -g pm2
pm2 start dist/index.js --name shop-bot
pm2 save && pm2 startup
```

### Shard Cloud / Heroku
O `Procfile` já está configurado: `worker: node dist/index.js`

## Convite do bot

```
https://discord.com/oauth2/authorize?client_id=SEU_CLIENT_ID&permissions=93184&scope=bot+applications.commands
```

Permissões incluídas: Manage Channels, Send Messages, View Channel, Embed Links, Attach Files, Read Message History.

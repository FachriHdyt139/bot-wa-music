const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const config = require('./config');
const { downloadAudio, cleanupFile, formatDuration } = require('./music');

// Track sedang proses download biar gak spam
const downloading = new Set();

// Status bot buat web page
let botStatus = {
  state: 'initializing', // initializing, qr, pairing, ready, disconnected
  pairingCode: null,
  phoneNumber: null,
  uptime: 0,
  lastActivity: null,
};

/**
 * Get bot status (buat web page)
 */
function getBotStatus() {
  return {
    ...botStatus,
    uptime: process.uptime(),
    lastActivity: botStatus.lastActivity || new Date().toISOString(),
  };
}

/**
 * Get Chromium instance berdasarkan environment
 */
async function getChromium() {
  const isRender = !!process.env.RENDER;

  if (isRender) {
    // Render: pake @sparticuz/chromium (serverless-friendly)
    const chromium = require('@sparticuz/chromium');
    console.log('[CHROME] Render mode - Using @sparticuz/chromium');
    return {
      executablePath: await chromium.executablePath(),
      args: chromium.args,
    };
  } else {
    // Local: pake Chrome yang udah terinstall
    const CHROME_PATH = process.env.CHROME_PATH || '/snap/bin/chromium';
    console.log(`[CHROME] Local mode - Using: ${CHROME_PATH}`);
    return {
      executablePath: CHROME_PATH,
      args: [],
    };
  }
}

/**
 * Inisialisasi WhatsApp Client
 */
async function createClient() {
  const chromium = await getChromium();

  const client = new Client({
    authStrategy: new LocalAuth({
      dataPath: './.wwebjs_auth',
    }),
    puppeteer: {
      headless: true,
      executablePath: chromium.executablePath,
      args: [
        ...chromium.args,
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu',
        '--disable-software-rasterizer',
      ],
    },
  });

  return client;
}

/**
 * Setup event handlers
 */
function setupBot(client) {

  // === QR Code Handler (untuk local testing) ===
  client.on('qr', (qr) => {
    botStatus.state = 'qr';
    console.log('\n📱 Scan QR Code ini pake WhatsApp lu, Bro!\n');
    qrcode.generate(qr, { small: true });
    console.log('\n⏳ Tunggu scan...\n');
  });

  // === Pairing Code Handler (untuk Render/headless) ===
  client.on('pairing_code', (code) => {
    botStatus.state = 'pairing';
    botStatus.pairingCode = code;
    console.log('\n═══════════════════════════════════════');
    console.log('  📲 PAIRING CODE UNTUK WHATSAPP');
    console.log('═══════════════════════════════════════');
    console.log(`  🔑 Kode: ${code}`);
    console.log('═══════════════════════════════════════');
    console.log('  Cara pakai:');
    console.log('  1. Buka WhatsApp di HP');
    console.log('  2. Tap titik tiga (⋮) > Linked Devices');
    console.log('  3. Tap "Link with Phone Number Instead"');
    console.log('  4. Masukkan kode di atas');
    console.log('═══════════════════════════════════════\n');
  });

  // === Ready Handler ===
  client.on('ready', async () => {
    botStatus.state = 'ready';
    botStatus.lastActivity = new Date().toISOString();
    console.log('═══════════════════════════════════════');
    console.log('  🎵 BOT WHATSAPP MUSIC SIAP! 🎵');
    console.log('═══════════════════════════════════════');
    console.log(`  ✅ Bot udah online!`);
    console.log(`  📌 Prefix: "${config.prefix}"`);
    console.log(`  🎧 Ketik: ${config.prefix}play <nama lagu>`);
    console.log(`  ❓ Bantuan: ${config.prefix}help`);
    console.log('═══════════════════════════════════════\n');

    // Kalau pairing mode aktif, request pairing code
    if (config.pairingMode === 'pairing' && config.pairingPhone) {
      try {
        console.log(`[PAIRING] Requesting pairing code for ${config.pairingPhone}...`);
        const code = await client.requestPairingCode(config.pairingPhone);
        console.log(`[PAIRING] Pairing code received!`);
      } catch (err) {
        console.error(`[PAIRING ERROR] Gagal request pairing code: ${err.message}`);
      }
    }
  });

  // === Auth Failure Handler ===
  client.on('auth_failure', (msg) => {
    botStatus.state = 'disconnected';
    console.error('❌ Auth gagal! Hapus folder .wwebjs_auth terus coba lagi.');
    console.error('Detail:', msg);
  });

  // === Disconnected Handler ===
  client.on('disconnected', (reason) => {
    botStatus.state = 'disconnected';
    console.log('⚠️  Bot disconnected:', reason);
    console.log('🔄 Mereconnect...');
  });

  // === Message Handler ===
  client.on('message', async (msg) => {
    botStatus.lastActivity = new Date().toISOString();
    try {
      await handleMessage(client, msg);
    } catch (err) {
      console.error('[ERROR]', err.message);
    }
  });

  return client;
}

/**
 * Handle incoming message
 */
async function handleMessage(client, msg) {
  const body = msg.body.trim();
  const prefix = config.prefix;

  // Skip kalau bukan command
  if (!body.startsWith(prefix)) return;

  // Skip kalau dari bot sendiri
  if (msg.fromMe) return;

  // Parse command
  const fullCommand = body.slice(prefix.length).trim();
  const command = fullCommand.split(' ')[0].toLowerCase();
  const args = fullCommand.slice(command.length).trim();

  console.log(`[CMD] ${msg.from}: ${prefix}${command} ${args}`);

  // === COMMAND: HELP ===
  if (command === 'help' || command === 'menu' || command === 'start') {
    await sendHelp(client, msg);
    return;
  }

  // === COMMAND: PLAY ===
  if (command === 'play' || command === 'p') {
    if (!args) {
      await msg.reply(
        `❌ *Format salah!*\n\n` +
        `Cara pakai:\n` +
        `${prefix}play <nama lagu>\n\n` +
        `Contoh:\n` +
        `${prefix}play dangdut koplo viral\n` +
        `${prefix}p arsenal vs man city\n`
      );
      return;
    }

    await handlePlay(client, msg, args);
    return;
  }

  // === COMMAND: STOP ===
  if (command === 'stop') {
    await msg.reply('🛑 Oke Bro, fitur stop belum tersedia. Bot tetap running!');
    return;
  }
}

/**
 * Handle perintah play
 */
async function handlePlay(client, msg, query) {
  const chatId = msg.from;

  // Cek apakah sedang download (anti-spam)
  if (downloading.has(chatId)) {
    await msg.reply('⏳ *Sabar Bro!* Lu lagi proses download nih. Tunggu sampe selesai dulu ya...');
    return;
  }

  // Tandai sedang proses
  downloading.add(chatId);

  let filePath = null;

  try {
    // Kirim pesan "searching"
    await client.sendMessage(chatId,
      `🔍 *Cari lagu...*\n\n` +
      `📝 Query: *${query}*\n` +
      `⏳ Tunggu bentar ya Bro...`
    );

    console.log(`[DOWNLOAD] Memulai download: ${query}`);

    // Download audio
    const result = await downloadAudio(query);
    filePath = result.filePath;

    console.log(`[DOWNLOAD] Selesai: ${result.title} (${formatDuration(result.duration)})`);

    // Kirim pesan info lagu
    await client.sendMessage(chatId,
      `✅ *Lagu ketemu!*\n\n` +
      `🎵 *${result.title}*\n` +
      `⏱️ Durasi: ${formatDuration(result.duration)}\n` +
      `📥 Lagi dikirim nih, sabar...`
    );

    // Kirim file audio
    const media = await MessageMedia.fromFilePath(filePath);
    await client.sendMessage(chatId, media, {
      caption: `🎵 *${result.title}*\n\n` +
               `📎 Source: ${result.url}\n` +
               `⏱️ Duration: ${formatDuration(result.duration)}\n\n` +
               `_Dikirim oleh Bot Music 🤖_`,
    });

    console.log(`[SEND] Audio terkirim ke ${chatId}`);

    // Cleanup file setelah dikirim (delay 3 detik biar WA sempet proses)
    setTimeout(() => {
      cleanupFile(filePath);
    }, 3000);

  } catch (err) {
    console.error(`[ERROR] Play gagal: ${err.message}`);

    await msg.reply(
      `❌ *Gagal play lagu!*\n\n` +
      `🔍 Query: *${query}*\n` +
      `💬 Error: ${err.message}\n\n` +
      `💡 *Tips:*\n` +
      `• Coba pake judul lagu yang lebih spesifik\n` +
      `• Pastikan judul lagu bener dan bisa dicari di YouTube\n` +
      `• Kalau sering gagal, coba tambahin nama artist`
    );

    // Cleanup file kalau error
    if (filePath) {
      cleanupFile(filePath);
    }
  } finally {
    // Hapus track download
    downloading.delete(chatId);
  }
}

/**
 * Kirim pesan help/menu
 */
async function sendHelp(client, msg) {
  const prefix = config.prefix;
  const helpText =
    `🎵 *BOT WHATSAPP MUSIC* 🎵\n\n` +
    `Halo Bro! Gue bot yang bisa puterin lagu dari YouTube. 🎧\n\n` +
    `══════════════════════════════\n` +
    `📌 *DAFTAR COMMAND:*\n` +
    `══════════════════════════════\n\n` +
    `🎶 *${prefix}play <nama lagu>*\n` +
    `   Puterin lagu berdasarkan judul/keyword\n` +
    `   Contoh: ${prefix}play dangdut koplo viral\n\n` +
    `🎶 *${prefix}p <nama lagu>*\n` +
    `   Shortcut dari .play\n\n` +
    `❓ *${prefix}help*\n` +
    `   Tampilkan pesan bantuan ini\n\n` +
    `══════════════════════════════\n` +
    `💡 *TIPS:*\n` +
    `══════════════════════════════\n\n` +
    `• Pake judul spesifik biar hasilnya akurat\n` +
    `• Contoh: ${prefix}play armada haruskah aku mati\n\n` +
    `• Max durasi lagu: ${config.maxDuration} detik (${Math.floor(config.maxDuration/60)} menit)\n\n` +
    `══════════════════════════════\n` +
    `🤖 _Bot Music v1.0 - Gratis & Open Source_`;

  await msg.reply(helpText);
}

module.exports = { createClient, setupBot, getBotStatus };

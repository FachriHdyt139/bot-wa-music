const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const config = require('./config');
const { downloadAudio, cleanupFile, formatDuration } = require('./music');

// Track sedang proses download biar gak spam
const downloading = new Set();

// Status bot buat web page
let botStatus = {
  state: 'initializing',
  pairingCode: null,
  qr: null,
  uptime: 0,
  lastActivity: null,
};

function getBotStatus() {
  return {
    ...botStatus,
    uptime: process.uptime(),
    lastActivity: botStatus.lastActivity || new Date().toISOString(),
  };
}

/**
 * Start WhatsApp Bot pake Baileys (Gak perlu Chrome!)
 */
async function startBot() {
  // Auth state - simpan session di folder
  const { state, saveCreds } = await useMultiFileAuthState('./.wwebjs_auth');

  // Fetch versi terbaru WhatsApp Web
  const { version, isLatest } = await fetchLatestBaileysVersion();
  console.log(`[WA] Using WA v${version.join('.')}, isLatest: ${isLatest}`);

  // Buat socket
  const sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
    },
    printQRInTerminal: false, // Kita pake pairing code, bukan QR
    generateHighQualityLinkPreview: false,
  });

  // === Save credentials saat update ===
  sock.ev.on('creds.update', saveCreds);

  // === Connection Update ===
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      botStatus.state = 'qr';
      botStatus.qr = qr;
      console.log('\n📱 QR Code available - Scan via WhatsApp!');
      const qrcode = require('qrcode-terminal');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const reason = lastDisconnect?.error?.output?.statusCode;
      console.log(`[WA] Connection closed. Reason: ${reason}`);

      if (reason !== DisconnectReason.loggedOut) {
        console.log('[WA] Reconnecting...');
        botStatus.state = 'reconnecting';
        setTimeout(() => startBot(), 3000);
      } else {
        console.log('[WA] Logged out. Delete .wwebjs_auth and restart.');
        botStatus.state = 'disconnected';
      }
    }

    if (connection === 'connecting') {
      botStatus.state = 'connecting';
      console.log('[WA] Connecting to WhatsApp...');
    }

    if (connection === 'open') {
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
    }
  });

  // === Message Handler ===
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      botStatus.lastActivity = new Date().toISOString();

      // Skip kalau dari bot sendiri
      if (msg.key.fromMe) continue;

      // Skip kalau gak ada message
      if (!msg.message) continue;

      try {
        await handleMessage(sock, msg);
      } catch (err) {
        console.error('[ERROR]', err.message);
      }
    }
  });

  return sock;
}

/**
 * Request Pairing Code
 */
async function requestPairingCode(sock, phoneNumber) {
  try {
    const code = await sock.requestPairingCode(phoneNumber);
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
    return code;
  } catch (err) {
    console.error('[PAIRING ERROR]', err.message);
    return null;
  }
}

/**
 * Handle incoming message
 */
async function handleMessage(sock, msg) {
  const body = getMessageBody(msg);
  if (!body) return;

  const prefix = config.prefix;
  if (!body.startsWith(prefix)) return;

  const from = msg.key.remoteJid;
  const fullCommand = body.slice(prefix.length).trim();
  const command = fullCommand.split(' ')[0].toLowerCase();
  const args = fullCommand.slice(command.length).trim();

  console.log(`[CMD] ${from}: ${prefix}${command} ${args}`);

  // === COMMAND: HELP ===
  if (command === 'help' || command === 'menu' || command === 'start') {
    await sendHelp(sock, from);
    return;
  }

  // === COMMAND: PLAY ===
  if (command === 'play' || command === 'p') {
    if (!args) {
      await sock.sendMessage(from, {
        text:
          `❌ *Format salah!*\n\n` +
          `Cara pakai:\n` +
          `${prefix}play <nama lagu>\n\n` +
          `Contoh:\n` +
          `${prefix}play dangdut koplo viral\n` +
          `${prefix}p arsenal vs man city\n`
      });
      return;
    }
    await handlePlay(sock, from, args);
    return;
  }

  // === COMMAND: STOP ===
  if (command === 'stop') {
    await sock.sendMessage(from, { text: '🛑 Oke Bro, fitur stop belum tersedia!' });
    return;
  }
}

/**
 * Extract message body dari berbagai tipe pesan
 */
function getMessageBody(msg) {
  const m = msg.message;
  if (!m) return null;

  // Text biasa
  if (m.conversation) return m.conversation;
  if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;
  if (m.ecommerceMessage?.text) return m.ecommerceMessage.text;

  // Caption dari media
  if (m.imageMessage?.caption) return m.imageMessage.caption;
  if (m.videoMessage?.caption) return m.videoMessage.caption;

  return null;
}

/**
 * Handle perintah play
 */
async function handlePlay(sock, from, query) {
  if (downloading.has(from)) {
    await sock.sendMessage(from, {
      text: '⏳ *Sabar Bro!* Lu lagi proses download nih. Tunggu sampe selesai dulu ya...'
    });
    return;
  }

  downloading.add(from);
  let filePath = null;

  try {
    // Kirim pesan "searching"
    await sock.sendMessage(from, {
      text:
        `🔍 *Cari lagu...*\n\n` +
        `📝 Query: *${query}*\n` +
        `⏳ Tunggu bentar ya Bro...`
    });

    console.log(`[DOWNLOAD] Memulai download: ${query}`);

    // Download audio
    const result = await downloadAudio(query);
    filePath = result.filePath;

    console.log(`[DOWNLOAD] Selesai: ${result.title} (${formatDuration(result.duration)})`);

    // Kirim pesan info lagu
    await sock.sendMessage(from, {
      text:
        `✅ *Lagu ketemu!*\n\n` +
        `🎵 *${result.title}*\n` +
        `⏱️ Durasi: ${formatDuration(result.duration)}\n` +
        `📥 Lagi dikirim nih, sabar...`
    });

    // Kirim file audio
    const fs = require('fs');
    const audioBuffer = fs.readFileSync(filePath);
    await sock.sendMessage(from, {
      audio: audioBuffer,
      mimetype: 'audio/mpeg',
      ptt: false,
    });

    // Kirim caption
    await sock.sendMessage(from, {
      text:
        `🎵 *${result.title}*\n\n` +
        `📎 Source: ${result.url}\n` +
        `⏱️ Duration: ${formatDuration(result.duration)}\n\n` +
        `_Dikirim oleh Bot Music 🤖_`
    });

    console.log(`[SEND] Audio terkirim ke ${from}`);

    // Cleanup file setelah dikirim
    setTimeout(() => {
      cleanupFile(filePath);
    }, 3000);

  } catch (err) {
    console.error(`[ERROR] Play gagal: ${err.message}`);
    await sock.sendMessage(from, {
      text:
        `❌ *Gagal play lagu!*\n\n` +
        `🔍 Query: *${query}*\n` +
        `💬 Error: ${err.message}\n\n` +
        `💡 *Tips:*\n` +
        `• Coba pake judul yang lebih spesifik\n` +
        `• Pastikan judul bisa dicari di YouTube`
    });

    if (filePath) cleanupFile(filePath);
  } finally {
    downloading.delete(from);
  }
}

/**
 * Kirim pesan help
 */
async function sendHelp(sock, from) {
  const prefix = config.prefix;
  await sock.sendMessage(from, {
    text:
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
      `• Max durasi: ${config.maxDuration} detik (${Math.floor(config.maxDuration/60)} menit)\n\n` +
      `══════════════════════════════\n` +
      `🤖 _Bot Music v2.0 - Gratis & Open Source_`
  });
}

module.exports = { startBot, requestPairingCode, getBotStatus };

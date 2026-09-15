/**
 * 🎵 BOT WHATSAPP MUSIC v2.0 🎵
 * 
 * WhatsApp Bot untuk play musik dari YouTube
 * Pake Baileys - GAK PERLU CHROME!
 * 
 * Author: FachriHdyt139
 * License: MIT (100% Gratis!)
 */

const express = require('express');
const { startBot, requestPairingCode, getBotStatus } = require('./src/bot');
const config = require('./src/config');

const app = express();
const PORT = config.port;
let whatsappSocket = null;

// ═══════════════════════════════════════════════
// WEB STATUS PAGE - QR CODE & PAIRING CODE
// ═══════════════════════════════════════════════

const STATUS_PAGE = `
<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🎵 Bot WhatsApp Music</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
        }
        .container {
            background: white;
            border-radius: 20px;
            padding: 40px;
            max-width: 500px;
            width: 100%;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            text-align: center;
        }
        .logo { font-size: 60px; margin-bottom: 10px; }
        h1 { color: #333; margin-bottom: 5px; font-size: 24px; }
        .subtitle { color: #666; margin-bottom: 30px; font-size: 14px; }
        .status-badge {
            display: inline-block;
            padding: 10px 25px;
            border-radius: 25px;
            font-weight: bold;
            margin-bottom: 25px;
            font-size: 14px;
        }
        .status-initializing, .status-connecting, .status-reconnecting { 
            background: #fff3cd; color: #856404; 
        }
        .status-pairing, .status-qr { 
            background: #d4edda; color: #155724; 
        }
        .status-ready { 
            background: #d1ecf1; color: #0c5460; 
        }
        .status-disconnected { 
            background: #f8d7da; color: #721c24; 
        }
        
        /* QR Code Section */
        .qr-section {
            background: #f8f9fa;
            border: 3px solid #25D366;
            border-radius: 15px;
            padding: 25px;
            margin: 20px 0;
        }
        .qr-section h3 {
            color: #333;
            margin-bottom: 15px;
            font-size: 16px;
        }
        .qr-section img {
            border: 5px solid white;
            border-radius: 10px;
            box-shadow: 0 5px 20px rgba(0,0,0,0.1);
            max-width: 280px;
            width: 100%;
        }
        .qr-section .hint {
            font-size: 12px;
            color: #666;
            margin-top: 15px;
        }
        
        /* Pairing Code Section */
        .pairing-section {
            background: #f8f9fa;
            border: 3px dashed #667eea;
            border-radius: 15px;
            padding: 25px;
            margin: 20px 0;
        }
        .pairing-section h3 {
            color: #333;
            margin-bottom: 15px;
            font-size: 16px;
        }
        .pairing-code-display {
            font-size: 42px;
            font-weight: bold;
            color: #667eea;
            letter-spacing: 8px;
            font-family: 'Courier New', monospace;
            background: white;
            padding: 15px 25px;
            border-radius: 10px;
            border: 2px solid #667eea;
            display: inline-block;
        }
        
        /* Instructions */
        .instructions {
            text-align: left;
            background: #e8f5e9;
            border-radius: 10px;
            padding: 20px;
            margin-top: 20px;
        }
        .instructions h3 {
            color: #2e7d32;
            margin-bottom: 15px;
            font-size: 15px;
        }
        .instructions ol {
            padding-left: 20px;
            color: #333;
            font-size: 14px;
        }
        .instructions li {
            margin-bottom: 10px;
            line-height: 1.6;
        }
        .instructions strong {
            color: #155724;
        }
        
        /* Ready Section */
        .ready-info {
            margin-top: 20px;
            padding: 20px;
            background: #d1ecf1;
            border-radius: 10px;
            color: #0c5460;
            font-weight: bold;
        }
        .commands {
            text-align: left;
            margin-top: 20px;
            padding: 15px;
            background: #f5f5f5;
            border-radius: 10px;
        }
        .commands h3 { 
            margin-bottom: 10px; 
            font-size: 14px; 
            color: #333; 
        }
        .commands code {
            display: block;
            padding: 10px;
            background: white;
            border-radius: 5px;
            margin: 8px 0;
            font-size: 13px;
            border-left: 3px solid #667eea;
        }
        .btn {
            display: inline-block;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 12px 30px;
            border-radius: 25px;
            text-decoration: none;
            font-weight: bold;
            margin-top: 25px;
            cursor: pointer;
            border: none;
            font-size: 16px;
            transition: transform 0.2s;
        }
        .btn:hover { transform: scale(1.05); }
        .refresh-note {
            font-size: 11px;
            color: #999;
            margin-top: 15px;
        }
        .error-msg {
            background: #f8d7da;
            color: #721c24;
            padding: 15px;
            border-radius: 10px;
            margin-top: 15px;
            font-size: 13px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">🎵</div>
        <h1>Bot WhatsApp Music</h1>
        <p class="subtitle">Play musik dari YouTube langsung ke WhatsApp</p>
        
        <div id="status-badge" class="status-badge status-initializing">⏳ Loading...</div>
        
        <!-- QR CODE SECTION -->
        <div id="qr-section" class="qr-section" style="display:none;">
            <h3>📱 Scan QR Code Ini</h3>
            <img id="qr-image" src="" alt="QR Code" />
            <p class="hint">Buka WhatsApp → ⋮ → Linked Devices → Link a Device</p>
        </div>
        
        <!-- PAIRING CODE SECTION -->
        <div id="pairing-section" class="pairing-section" style="display:none;">
            <h3>🔢 Atau Pakai Kode Pairing</h3>
            <div id="pairing-code" class="pairing-code-display">--------</div>
            
            <div class="instructions">
                <h3>📱 Cara Pakai:</h3>
                <ol>
                    <li>Buka <strong>WhatsApp</strong> di HP lu</li>
                    <li>Tap <strong>titik tiga (⋮)</strong> → <strong>Linked Devices</strong></li>
                    <li>Tap <strong>"Link with Phone Number Instead"</strong></li>
                    <li>Masukkan kode <strong>8 digit</strong> di atas</li>
                    <li>Tunggu sampe bot online!</li>
                </ol>
            </div>
        </div>
        
        <!-- READY SECTION -->
        <div id="ready-section" style="display:none;">
            <div class="ready-info">✅ Bot udah online dan siap dipake!</div>
            <div class="commands">
                <h3>📌 Commands:</h3>
                <code>.play &lt;nama lagu&gt;</code>
                <code>.p &lt;nama lagu&gt;</code>
                <code>.help</code>
            </div>
        </div>
        
        <!-- ERROR SECTION -->
        <div id="error-section" class="error-msg" style="display:none;"></div>
        
        <button class="btn" onclick="location.reload()">🔄 Refresh Halaman</button>
        <p class="refresh-note">Halaman auto-refresh setiap 5 detik</p>
    </div>

    <script>
        async function updateStatus() {
            try {
                const res = await fetch('/api/status');
                const data = await res.json();
                
                const badge = document.getElementById('status-badge');
                const qrSection = document.getElementById('qr-section');
                const pairingSection = document.getElementById('pairing-section');
                const readySection = document.getElementById('ready-section');
                const errorSection = document.getElementById('error-section');
                const qrImage = document.getElementById('qr-image');
                const pairingCode = document.getElementById('pairing-code');
                
                // Reset all sections
                qrSection.style.display = 'none';
                pairingSection.style.display = 'none';
                readySection.style.display = 'none';
                errorSection.style.display = 'none';
                
                badge.className = 'status-badge status-' + data.state;
                
                switch(data.state) {
                    case 'qr':
                        badge.textContent = '📱 Scan QR Code atau Pakai Kode';
                        qrSection.style.display = 'block';
                        pairingSection.style.display = 'block';
                        if (data.qrImage) {
                            qrImage.src = data.qrImage;
                        }
                        if (data.pairingCode) {
                            pairingCode.textContent = data.pairingCode;
                        } else {
                            pairingCode.textContent = 'Tunggu sebentar...';
                        }
                        break;
                        
                    case 'pairing':
                        badge.textContent = '📲 Masukkan Kode Pairing';
                        pairingSection.style.display = 'block';
                        if (data.pairingCode) {
                            pairingCode.textContent = data.pairingCode;
                        }
                        break;
                        
                    case 'ready':
                        badge.textContent = '✅ Bot Online!';
                        readySection.style.display = 'block';
                        break;
                        
                    case 'connecting':
                    case 'reconnecting':
                        badge.textContent = '🔄 Connecting ke WhatsApp...';
                        break;
                        
                    case 'disconnected':
                        badge.textContent = '❌ Disconnected - Refresh untuk reconnect';
                        errorSection.style.display = 'block';
                        errorSection.textContent = 'Bot disconnected. Klik refresh untuk reconnect.';
                        break;
                        
                    default:
                        badge.textContent = '⏳ Initializing...';
                }
            } catch(err) {
                console.error('Gagal fetch status:', err);
            }
        }
        
        updateStatus();
        setInterval(updateStatus, 5000); // Auto-refresh setiap 5 detik
    </script>
</body>
</html>
`;

// ═══════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════

app.get('/', (req, res) => {
  res.send(STATUS_PAGE);
});

app.get('/api/status', (req, res) => {
  res.json(getBotStatus());
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// ═══════════════════════════════════════════════
// START
// ═══════════════════════════════════════════════

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Web server jalan di port ${PORT}`);
  console.log(`🌐 Buka https://bot-wa-music.onrender.com buat lihat status`);
});

// ═══════════════════════════════════════════════
// WHATSAPP BOT
// ═══════════════════════════════════════════════

console.log('\n🚀 Starting WhatsApp Music Bot v2.0 (No Chrome!)...\n');

(async () => {
  try {
    whatsappSocket = await startBot();

    // Request pairing code kalau mode pairing
    if (config.pairingMode === 'pairing' && config.pairingPhone) {
      setTimeout(async () => {
        await requestPairingCode(whatsappSocket, config.pairingPhone);
      }, 5000);
    }
  } catch (err) {
    console.error('❌ Gagal start bot:', err.message);
  }
})();

// ═══════════════════════════════════════════════
// GRACEFUL SHUTDOWN
// ═══════════════════════════════════════════════

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION]', reason);
});

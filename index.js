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

// ═══════════════════════════════════════════════
// WEB SERVER
// ═══════════════════════════════════════════════

const app = express();
const PORT = config.port;
let whatsappSocket = null;

// ═══════════════════════════════════════════════
// WEB STATUS PAGE
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
        h1 { color: #333; margin-bottom: 5px; }
        .subtitle { color: #666; margin-bottom: 30px; }
        .status-badge {
            display: inline-block;
            padding: 8px 20px;
            border-radius: 20px;
            font-weight: bold;
            margin-bottom: 20px;
            font-size: 14px;
        }
        .status-initializing, .status-connecting, .status-reconnecting { background: #fff3cd; color: #856404; }
        .status-pairing { background: #d4edda; color: #155724; }
        .status-ready { background: #d1ecf1; color: #0c5460; }
        .status-disconnected { background: #f8d7da; color: #721c24; }
        .pairing-code {
            background: #f8f9fa;
            border: 3px dashed #667eea;
            border-radius: 15px;
            padding: 25px;
            margin: 20px 0;
        }
        .pairing-code .label {
            font-size: 14px;
            color: #666;
            margin-bottom: 10px;
        }
        .pairing-code .code {
            font-size: 36px;
            font-weight: bold;
            color: #667eea;
            letter-spacing: 5px;
            font-family: 'Courier New', monospace;
        }
        .instructions {
            text-align: left;
            background: #f8f9fa;
            border-radius: 10px;
            padding: 20px;
            margin-top: 20px;
        }
        .instructions h3 {
            color: #333;
            margin-bottom: 15px;
            font-size: 16px;
        }
        .instructions ol {
            padding-left: 20px;
            color: #555;
        }
        .instructions li {
            margin-bottom: 10px;
            line-height: 1.5;
        }
        .btn {
            display: inline-block;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 12px 30px;
            border-radius: 25px;
            text-decoration: none;
            font-weight: bold;
            margin-top: 20px;
            cursor: pointer;
            border: none;
            font-size: 16px;
        }
        .btn:hover { transform: scale(1.05); }
        .info {
            margin-top: 20px;
            padding: 15px;
            background: #e8f5e9;
            border-radius: 10px;
            color: #2e7d32;
        }
        .commands {
            text-align: left;
            margin-top: 20px;
            padding: 15px;
            background: #f5f5f5;
            border-radius: 10px;
        }
        .commands h3 { margin-bottom: 10px; font-size: 14px; color: #333; }
        .commands code {
            display: block;
            padding: 8px;
            background: white;
            border-radius: 5px;
            margin: 5px 0;
            font-size: 13px;
        }
        .refresh-note {
            font-size: 12px;
            color: #999;
            margin-top: 15px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">🎵</div>
        <h1>Bot WhatsApp Music</h1>
        <p class="subtitle">Play musik dari YouTube langsung ke WhatsApp</p>
        
        <div id="status-badge" class="status-badge status-initializing">⏳ Loading...</div>
        
        <div id="pairing-section" style="display:none;">
            <div class="pairing-code">
                <div class="label">KODE PAIRING ANDA</div>
                <div id="pairing-code" class="code">--------</div>
            </div>
            
            <div class="instructions">
                <h3>📱 Cara Pairing WhatsApp:</h3>
                <ol>
                    <li>Buka <strong>WhatsApp</strong> di HP lu</li>
                    <li>Tap <strong>titik tiga (⋮)</strong> > <strong>Linked Devices</strong></li>
                    <li>Tap <strong>"Link with Phone Number Instead"</strong></li>
                    <li>Masukkan kode <strong>8 digit</strong> di atas</li>
                    <li>Tunggu sampe bot online!</li>
                </ol>
            </div>
        </div>
        
        <div id="ready-section" style="display:none;">
            <div class="info">
                ✅ Bot udah online dan siap dipake!
            </div>
            
            <div class="commands">
                <h3>📌 Commands:</h3>
                <code>.play &lt;nama lagu&gt;</code>
                <code>.p &lt;nama lagu&gt;</code>
                <code>.help</code>
            </div>
        </div>
        
        <button class="btn" onclick="location.reload()">🔄 Refresh</button>
        <p class="refresh-note">Auto-refresh setiap 10 detik</p>
    </div>

    <script>
        async function updateStatus() {
            try {
                const res = await fetch('/api/status');
                const data = await res.json();
                
                const badge = document.getElementById('status-badge');
                const pairingSection = document.getElementById('pairing-section');
                const readySection = document.getElementById('ready-section');
                const pairingCode = document.getElementById('pairing-code');
                
                badge.className = 'status-badge status-' + data.state;
                
                switch(data.state) {
                    case 'pairing':
                        badge.textContent = '📲 Menunggu Pairing...';
                        pairingSection.style.display = 'block';
                        readySection.style.display = 'none';
                        pairingCode.textContent = data.pairingCode || '--------';
                        break;
                    case 'ready':
                        badge.textContent = '✅ Bot Online!';
                        pairingSection.style.display = 'none';
                        readySection.style.display = 'block';
                        break;
                    case 'connecting':
                    case 'reconnecting':
                        badge.textContent = '🔄 Connecting...';
                        pairingSection.style.display = 'none';
                        readySection.style.display = 'none';
                        break;
                    case 'disconnected':
                        badge.textContent = '❌ Disconnected';
                        pairingSection.style.display = 'none';
                        readySection.style.display = 'none';
                        break;
                    default:
                        badge.textContent = '⏳ Initializing...';
                        pairingSection.style.display = 'none';
                        readySection.style.display = 'none';
                }
            } catch(err) {
                console.error('Gagal fetch status:', err);
            }
        }
        
        updateStatus();
        setInterval(updateStatus, 10000);
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
});

// ═══════════════════════════════════════════════
// WHATSAPP BOT
// ═══════════════════════════════════════════════

console.log('\n🚀 Starting WhatsApp Music Bot v2.0 (Baileys - No Chrome!)...\n');

(async () => {
  try {
    // Start bot
    whatsappSocket = await startBot();

    // Request pairing code kalau mode pairing
    if (config.pairingMode === 'pairing' && config.pairingPhone) {
      // Tunggu sebentar biar koneksi stabil
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

process.on('SIGINT', () => {
  console.log('\n🛑 Shutdown bot...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutdown bot (SIGTERM)...');
  process.exit(0);
});

process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION]', reason);
});

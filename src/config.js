require('dotenv').config();

module.exports = {
  // Command prefix
  prefix: process.env.PREFIX || '.',

  // Max audio duration (seconds)
  maxDuration: parseInt(process.env.MAX_DURATION) || 600,

  // YouTube cookies file (optional)
  cookiesFile: process.env.COOKIES_FILE || '',

  // Web server port (for Render)
  port: parseInt(process.env.PORT) || 3000,

  // Pairing mode: "qr" atau "pairing"
  pairingMode: process.env.PAIRING_MODE || 'qr',

  // Phone number buat pairing code (format: 628xxxxxxx)
  pairingPhone: process.env.PAIRING_PHONE || '',

  // Temp folder for downloads
  tempFolder: './temp',
};

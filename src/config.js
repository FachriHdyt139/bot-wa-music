require('dotenv').config();

module.exports = {
  // Command prefix
  prefix: process.env.PREFIX || '.',

  // Max audio duration (seconds)
  maxDuration: parseInt(process.env.MAX_DURATION) || 600,

  // yt-dlp binary path
  ytdlpPath: process.env.YTDLP_PATH || '/home/fachri/bin/yt-dlp',

  // ffmpeg & ffprobe path (buat convert audio)
  ffmpegPath: process.env.FFMPEG_PATH || '/home/fachri/bin/ffmpeg',

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

  // Commands list
  commands: {
    play: 'play',
    help: 'help',
  },
};

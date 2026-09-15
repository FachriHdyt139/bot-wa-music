const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const config = require('./config');

// Pastikan temp folder ada
if (!fs.existsSync(config.tempFolder)) {
  fs.mkdirSync(config.tempFolder, { recursive: true });
}

// User-Agent palsu biar kaya browser beneran
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/**
 * Convert JSON cookies ke Netscape format
 */
function convertCookiesToNetscape(jsonCookiePath) {
  const netscapePath = jsonCookiePath.replace('.txt', '_netscape.txt');

  if (fs.existsSync(netscapePath)) {
    return netscapePath;
  }

  try {
    const rawData = fs.readFileSync(jsonCookiePath, 'utf8');
    const cookies = JSON.parse(rawData);

    let netscape = '# Netscape HTTP Cookie File\n';
    netscape += '# https://curl.se/docs/http-cookies.html\n\n';

    for (const cookie of cookies) {
      const domain = cookie.domain || '';
      const flag = domain.startsWith('.') ? 'TRUE' : 'FALSE';
      const cookiePath = cookie.path || '/';
      const secure = cookie.secure ? 'TRUE' : 'FALSE';
      const expiration = cookie.expirationDate
        ? Math.floor(cookie.expirationDate)
        : 0;
      const name = cookie.name || '';
      const value = cookie.value || '';

      netscape += `${domain}\t${flag}\t${cookiePath}\t${secure}\t${expiration}\t${name}\t${value}\n`;
    }

    fs.writeFileSync(netscapePath, netscape, 'utf8');
    console.log(`[COOKIES] Converted JSON -> Netscape: ${netscapePath}`);
    return netscapePath;
  } catch (err) {
    console.error(`[COOKIES ERROR] Gagal convert: ${err.message}`);
    return null;
  }
}

/**
 * Hapus cookies Netscape lama biar di-regenerate
 */
function refreshCookies() {
  if (!config.cookiesFile) return;
  const netscapePath = config.cookiesFile.replace('.txt', '_netscape.txt');
  if (fs.existsSync(netscapePath)) {
    fs.unlinkSync(netscapePath);
    console.log(`[COOKIES] Deleted old Netscape cookies, will regenerate`);
  }
}

/**
 * Get cookies path (auto-convert kalau JSON format)
 */
function getCookiesPath() {
  if (!config.cookiesFile || !fs.existsSync(config.cookiesFile)) {
    return null;
  }

  const content = fs.readFileSync(config.cookiesFile, 'utf8').trim();
  if (content.startsWith('[') || content.startsWith('{')) {
    return convertCookiesToNetscape(config.cookiesFile);
  }

  return config.cookiesFile;
}

/**
 * Build common yt-dlp args (anti-bot)
 */
function buildBaseArgs() {
  return [
    '--no-warnings',
    '--no-playlist',
    '--no-check-certificates',
    '--user-agent', USER_AGENT,
    '--ffmpeg-location', path.dirname(config.ffmpegPath),
  ];
}

/**
 * Tambah cookies ke args kalau ada
 */
function addCookiesToArgs(args) {
  const cookiesPath = getCookiesPath();
  if (cookiesPath) {
    args.push('--cookies', cookiesPath);
  }
  return args;
}

/**
 * Jalankan yt-dlp dengan retry
 */
function runYtDlp(baseArgs, timeout) {
  return new Promise((resolve, reject) => {
    let lastError = null;
    let attempt = 0;
    const maxRetry = 2;

    function tryRun() {
      attempt++;
      const args = [...baseArgs];
      console.log(`[YTDLP] Attempt ${attempt}/${maxRetry}`);

      execFile(config.ytdlpPath, args, { timeout }, (error, stdout, stderr) => {
        if (error) {
          lastError = error;
          console.log(`[YTDLP] Error: ${(stderr || error.message).substring(0, 100)}`);

          if (attempt < maxRetry) {
            console.log(`[YTDLP] Retry ${attempt + 1}/${maxRetry}...`);
            setTimeout(tryRun, 2000 * attempt);
            return;
          }

          reject(new Error(`Gagal setelah ${maxRetry} percobaan: ${lastError.message}`));
          return;
        }

        resolve(stdout);
      });
    }

    tryRun();
  });
}

/**
 * Cari video di YouTube
 */
async function searchYouTube(query) {
  const args = buildBaseArgs();
  args.push(
    `ytsearch1:${query}`,
    '--flat-playlist',
    '--no-download',
    '--print', '%(id)s|||%(title)s|||%(duration)s|||%(thumbnail)s|||%(webpage_url)s',
  );
  addCookiesToArgs(args);

  const stdout = await runYtDlp(args, 30000);
  const output = stdout.trim();

  if (!output) {
    throw new Error('Gak ada hasil ditemukan untuk query itu, Bro!');
  }

  const parts = output.split('|||');
  if (parts.length < 5) {
    throw new Error('Format output gak valid');
  }

  return {
    id: parts[0],
    title: parts[1],
    duration: parseInt(parts[2]) || 0,
    thumbnail: parts[3],
    url: parts[4],
  };
}

/**
 * Download audio dari YouTube
 */
async function downloadAudio(query) {
  // Step 1: Cari video dulu
  const videoInfo = await searchYouTube(query);

  // Step 2: Cek durasi
  if (videoInfo.duration > config.maxDuration) {
    throw new Error(`Lagu terlalu panjang (${videoInfo.duration}s). Max ${config.maxDuration}s aja, Bro!`);
  }

  // Step 3: Generate filename unik
  const filename = `audio_${Date.now()}_${videoInfo.id}.mp3`;
  const filePath = path.join(config.tempFolder, filename);

  // Step 4: Download audio
  const args = buildBaseArgs();
  args.push(
    videoInfo.url,
    '-x',
    '--audio-format', 'mp3',
    '--audio-quality', '128K',
    '-o', filePath,
    '--prefer-free-formats',
  );
  addCookiesToArgs(args);

  await runYtDlp(args, 120000);

  // Cek file exist
  if (!fs.existsSync(filePath)) {
    const files = fs.readdirSync(config.tempFolder)
      .filter(f => f.includes(videoInfo.id))
      .map(f => path.join(config.tempFolder, f));

    if (files.length > 0) {
      return {
        filePath: files[0],
        title: videoInfo.title,
        duration: videoInfo.duration,
        url: videoInfo.url,
      };
    }
    throw new Error('File audio gak ditemukan setelah download');
  }

  return {
    filePath,
    title: videoInfo.title,
    duration: videoInfo.duration,
    url: videoInfo.url,
  };
}

/**
 * Hapus file temporary
 */
function cleanupFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`[CLEANUP] File dihapus: ${filePath}`);
    }
  } catch (err) {
    console.error(`[CLEANUP ERROR] Gagal hapus file: ${err.message}`);
  }
}

/**
 * Format durasi dari seconds ke MM:SS
 */
function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

module.exports = {
  searchYouTube,
  downloadAudio,
  cleanupFile,
  formatDuration,
  getCookiesPath,
  convertCookiesToNetscape,
};

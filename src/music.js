const play = require('play-dl');
const path = require('path');
const fs = require('fs');
const config = require('./config');

// Pastikan temp folder ada
if (!fs.existsSync(config.tempFolder)) {
  fs.mkdirSync(config.tempFolder, { recursive: true });
}

/**
 * Set YouTube cookies untuk bypass bot detection
 */
function setupCookies() {
  try {
    const cookiesPath = path.resolve('./cookies/cookies.txt');
    if (!fs.existsSync(cookiesPath)) {
      console.log('[COOKIES] No cookies.txt found');
      return false;
    }

    const content = fs.readFileSync(cookiesPath, 'utf8');
    const cookies = JSON.parse(content);

    // Convert ke format play-dl
    const cookieString = cookies
      .filter(c => c.domain.includes('youtube'))
      .map(c => `${c.name}=${c.value}`)
      .join('; ');

    if (cookieString) {
      play.setToken({ cookie: cookieString });
      console.log(`[COOKIES] Loaded ${cookies.length} cookies for YouTube`);
      return true;
    }

    console.log('[COOKIES] No valid YouTube cookies found');
    return false;
  } catch (err) {
    console.error(`[COOKIES ERROR] ${err.message}`);
    return false;
  }
}

// Setup cookies saat startup
const hasCookies = setupCookies();

/**
 * Cari video di YouTube berdasarkan query
 */
async function searchYouTube(query) {
  try {
    console.log(`[SEARCH] Mencari: ${query}`);

    // Cari video pake play-dl
    const searched = await play.search(query, { limit: 1 });

    if (!searched || searched.length === 0) {
      throw new Error('Gak ada hasil ditemukan');
    }

    const video = searched[0];
    const durationParts = (video.duration?.raw || '0:00').split(':');
    let durationSeconds = 0;
    if (durationParts.length === 2) {
      durationSeconds = parseInt(durationParts[0]) * 60 + parseInt(durationParts[1]);
    } else if (durationParts.length === 3) {
      durationSeconds = parseInt(durationParts[0]) * 3600 + parseInt(durationParts[1]) * 60 + parseInt(durationParts[2]);
    }

    console.log(`[SEARCH] Ditemukan: ${video.title} (${video.duration?.raw || '0:00'})`);

    return {
      id: video.id,
      title: video.title || 'Unknown',
      duration: durationSeconds,
      thumbnail: video.thumbnails?.[0]?.url || '',
      url: video.url,
    };
  } catch (err) {
    throw new Error(`Gagal cari video: ${err.message}`);
  }
}

/**
 * Download audio dari YouTube pake play-dl
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

  // Step 4: Download audio pake play-dl
  console.log(`[DOWNLOAD] Downloading: ${videoInfo.title}`);
  console.log(`[DOWNLOAD] URL: ${videoInfo.url}`);
  console.log(`[DOWNLOAD] Cookies: ${hasCookies ? 'YES' : 'NO'}`);

  try {
    // Dapatkan stream info
    const stream = await play.stream(videoInfo.url, {
      quality: 2, // Best audio quality
    });

    // Simpan ke file
    const writable = fs.createWriteStream(filePath);

    return new Promise((resolve, reject) => {
      stream.stream.pipe(writable);

      writable.on('finish', () => {
        if (fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);
          if (stats.size > 0) {
            console.log(`[DOWNLOAD] Selesai: ${videoInfo.title} (${stats.size} bytes)`);
            resolve({
              filePath,
              title: videoInfo.title,
              duration: videoInfo.duration,
              url: videoInfo.url,
            });
          } else {
            reject(new Error('File audio kosong'));
          }
        } else {
          reject(new Error('File audio gak ditemukan'));
        }
      });

      stream.stream.on('error', (err) => {
        reject(new Error(`Stream error: ${err.message}`));
      });

      writable.on('error', (err) => {
        reject(new Error(`Write error: ${err.message}`));
      });
    });
  } catch (err) {
    throw new Error(`Download gagal: ${err.message}`);
  }
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
    console.error(`[CLEANUP ERROR] ${err.message}`);
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
};

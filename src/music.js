const ytdl = require('@distube/ytdl-core');
const path = require('path');
const fs = require('fs');
const config = require('./config');

// Pastikan temp folder ada
if (!fs.existsSync(config.tempFolder)) {
  fs.mkdirSync(config.tempFolder, { recursive: true });
}

/**
 * Cari info video dari YouTube berdasarkan query
 * Pake ytdl-core (Node.js native, gak perlu yt-dlp!)
 */
async function searchYouTube(query) {
  try {
    // Cari video pake ytdl
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    const info = await ytdl.getInfo(searchUrl);

    if (!info || !info.videoDetails) {
      throw new Error('Gak ada hasil ditemukan untuk query itu, Bro!');
    }

    const details = info.videoDetails;
    return {
      id: details.videoId,
      title: details.title,
      duration: parseInt(details.lengthSeconds) || 0,
      thumbnail: details.thumbnails?.[0]?.url || '',
      url: details.videoUrl || `https://www.youtube.com/watch?v=${details.videoId}`,
    };
  } catch (err) {
    throw new Error(`Gagal cari video: ${err.message}`);
  }
}

/**
 * Download audio dari YouTube pake ytdl-core
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

  // Step 4: Download audio pake ytdl-core
  const videoUrl = `https://www.youtube.com/watch?v=${videoInfo.id}`;

  const stream = ytdl(videoUrl, {
    quality: 'highestaudio',
    filter: 'audioonly',
    dlChunkSize: 0,
  });

  // Simpan ke file
  const writable = fs.createWriteStream(filePath);

  return new Promise((resolve, reject) => {
    stream.pipe(writable);

    writable.on('finish', () => {
      // Cek file exist dan ada isinya
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        if (stats.size > 0) {
          console.log(`[DOWNLOAD] File saved: ${filePath} (${stats.size} bytes)`);
          resolve({
            filePath,
            title: videoInfo.title,
            duration: videoInfo.duration,
            url: videoInfo.url,
          });
        } else {
          reject(new Error('File audio kosong setelah download'));
        }
      } else {
        reject(new Error('File audio gak ditemukan setelah download'));
      }
    });

    stream.on('error', (err) => {
      reject(new Error(`Gagal download audio: ${err.message}`));
    });

    writable.on('error', (err) => {
      reject(new Error(`Gagal simpan file: ${err.message}`));
    });
  });
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
};

const https = require('https');
const http = require('http');
const path = require('path');
const fs = require('fs');
const config = require('./config');

// Pastikan temp folder ada
if (!fs.existsSync(config.tempFolder)) {
  fs.mkdirSync(config.tempFolder, { recursive: true });
}

/**
 * HTTP request helper
 */
function httpRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.request(url, {
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: 60000,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data, headers: res.headers }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    if (options.body) req.write(options.body);
    req.end();
  });
}

/**
 * Download file dari URL ke path
 */
function downloadFile(url, filePath) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { timeout: 120000 }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return downloadFile(res.headers.location, filePath).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const writable = fs.createWriteStream(filePath);
      res.pipe(writable);
      writable.on('finish', () => {
        writable.close();
        resolve(filePath);
      });
      writable.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Download timeout')); });
  });
}

/**
 * Cari video di YouTube pake Innertube API
 */
async function searchYouTube(query) {
  try {
    console.log(`[SEARCH] Mencari: ${query}`);

    const body = {
      context: {
        client: {
          clientName: 'WEB',
          clientVersion: '2.20240101.00.00',
          hl: 'en',
          gl: 'US',
        },
      },
      query: query,
    };

    const result = await httpRequest(
      'https://www.youtube.com/youtubei/v1/search?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );

    const data = JSON.parse(result.data);
    const contents = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents;

    if (!contents || contents.length === 0) {
      throw new Error('Gak ada hasil ditemukan');
    }

    for (const item of contents) {
      const video = item.videoRenderer;
      if (video && video.videoId) {
        const durationText = video.lengthText?.simpleText || '0:00';
        const durationParts = durationText.split(':');
        let durationSeconds = 0;
        if (durationParts.length === 2) {
          durationSeconds = parseInt(durationParts[0]) * 60 + parseInt(durationParts[1]);
        } else if (durationParts.length === 3) {
          durationSeconds = parseInt(durationParts[0]) * 3600 + parseInt(durationParts[1]) * 60 + parseInt(durationParts[2]);
        }

        console.log(`[SEARCH] Ditemukan: ${video.title?.runs?.[0]?.text} (${durationText})`);

        return {
          id: video.videoId,
          title: video.title?.runs?.[0]?.text || 'Unknown',
          duration: durationSeconds,
          thumbnail: video.thumbnail?.thumbnails?.[video.thumbnail.thumbnails.length - 1]?.url || '',
          url: `https://www.youtube.com/watch?v=${video.videoId}`,
        };
      }
    }

    throw new Error('Gak ada video ditemukan');
  } catch (err) {
    throw new Error(`Gagal cari video: ${err.message}`);
  }
}

/**
 * Download audio dari YouTube pake Cobalt API (gratis, gak perlu cookies!)
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

  // Step 4: Download pake Cobalt API
  console.log(`[DOWNLOAD] Downloading: ${videoInfo.title}`);

  try {
    // Request ke Cobalt API
    const cobaltResult = await httpRequest('https://api.cobalt.tools/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        url: videoInfo.url,
        audioFormat: 'mp3',
        isAudioOnly: true,
      }),
    });

    console.log(`[DOWNLOAD] Cobalt response: ${cobaltResult.status}`);

    const cobaltData = JSON.parse(cobaltResult.data);
    console.log(`[DOWNLOAD] Cobalt data:`, JSON.stringify(cobaltData).substring(0, 200));

    if (cobaltData.url) {
      // Download dari URL yang dikasih Cobalt
      console.log(`[DOWNLOAD] Downloading from Cobalt URL...`);
      await downloadFile(cobaltData.url, filePath);
    } else if (cobaltData.error) {
      throw new Error(`Cobalt error: ${cobaltData.error}`);
    } else {
      throw new Error('Cobalt gak ngasih URL download');
    }

    // Cek file
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      if (stats.size > 0) {
        console.log(`[DOWNLOAD] Selesai: ${videoInfo.title} (${stats.size} bytes)`);
        return {
          filePath,
          title: videoInfo.title,
          duration: videoInfo.duration,
          url: videoInfo.url,
        };
      }
    }

    throw new Error('File audio kosong');
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

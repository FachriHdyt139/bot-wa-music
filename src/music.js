const https = require('https');
const http = require('http');
const ytdl = require('@distube/ytdl-core');
const path = require('path');
const fs = require('fs');
const config = require('./config');

// Pastikan temp folder ada
if (!fs.existsSync(config.tempFolder)) {
  fs.mkdirSync(config.tempFolder, { recursive: true });
}

/**
 * Parse Netscape cookies file ke format yang dimengerti ytdl-core
 */
function parseCookiesFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const cookies = [];

    for (const line of lines) {
      // Skip comment dan empty line
      if (line.startsWith('#') || line.trim() === '') continue;

      const parts = line.split('\t');
      if (parts.length >= 7) {
        cookies.push({
          name: parts[5],
          value: parts[6],
          domain: parts[0],
          path: parts[2],
          secure: parts[3] === 'TRUE',
          expires: parseInt(parts[4]) || -1,
        });
      }
    }

    console.log(`[COOKIES] Loaded ${cookies.length} cookies`);
    return cookies.length > 0 ? cookies : null;
  } catch (err) {
    console.error(`[COOKIES ERROR] ${err.message}`);
    return null;
  }
}

// Load cookies sekali saat startup
const cookiesFile = path.resolve('./cookies/cookies_netscape.txt');
const cookies = parseCookiesFile(cookiesFile);
const agent = cookies ? ytdl.createAgent(cookies) : null;

if (agent) {
  console.log('[COOKIES] Agent created - YouTube bot detection bypassed!');
} else {
  console.log('[COOKIES] No cookies found - download might fail!');
}

/**
 * Fetch URL dan return JSON
 */
function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 15000,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Gagal parse response'));
        }
      });
    }).on('error', reject);
  });
}

/**
 * Cari video di YouTube pake Innertube API (gratis, tanpa API key)
 */
async function searchYouTube(query) {
  try {
    console.log(`[SEARCH] Mencari: ${query}`);

    // Pake YouTube Innertube API
    const searchUrl = `https://www.youtube.com/youtubei/v1/search?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8&q=${encodeURIComponent(query)}&type=video&videoCategory=10`;

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

    // POST request ke YouTube API
    const postData = JSON.stringify(body);

    const result = await new Promise((resolve, reject) => {
      const req = https.request('https://www.youtube.com/youtubei/v1/search?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Content-Length': Buffer.byteLength(postData),
        },
        timeout: 15000,
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error('Gagal parse YouTube response'));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('YouTube API timeout'));
      });

      req.write(postData);
      req.end();
    });

    // Parse hasil search
    const contents = result?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents;

    if (!contents || contents.length === 0) {
      throw new Error('Gak ada hasil ditemukan');
    }

    // Cari video pertama
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

  // Step 4: Download audio pake ytdl-core + cookies
  console.log(`[DOWNLOAD] Downloading: ${videoInfo.title}`);

  const ytdlOptions = {
    quality: 'highestaudio',
    filter: 'audioonly',
    dlChunkSize: 0,
  };

  // Tambahkan agent (cookies) kalau ada
  if (agent) {
    ytdlOptions.agent = agent;
    console.log('[DOWNLOAD] Using cookies agent');
  } else {
    console.log('[DOWNLOAD] No cookies - might fail!');
  }

  const stream = ytdl(videoInfo.url, ytdlOptions);

  const writable = fs.createWriteStream(filePath);

  return new Promise((resolve, reject) => {
    stream.pipe(writable);

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
          reject(new Error('File audio kosong setelah download'));
        }
      } else {
        reject(new Error('File audio gak ditemukan'));
      }
    });

    stream.on('error', (err) => {
      reject(new Error(`Gagal download: ${err.message}`));
    });

    writable.on('error', (err) => {
      reject(new Error(`Gagal simpan: ${err.message}`));
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

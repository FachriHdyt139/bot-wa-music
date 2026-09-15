const https = require('https');
const path = require('path');
const fs = require('fs');
const config = require('./config');

if (!fs.existsSync(config.tempFolder)) {
  fs.mkdirSync(config.tempFolder, { recursive: true });
}

const YT_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';

function postJSON(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      timeout: 30000,
    }, (res) => {
      let buf = '';
      res.on('data', (c) => buf += c);
      res.on('end', () => {
        try { resolve(JSON.parse(buf)); }
        catch (e) { reject(new Error('Parse error: ' + buf.substring(0, 200))); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(data);
    req.end();
  });
}

function downloadFile(url, filePath, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : require('http');
    client.get(url, { timeout: 120000, headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if ((res.statusCode === 301 || res.statusCode === 302) && maxRedirects > 0) {
        return downloadFile(res.headers.location, filePath, maxRedirects - 1).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const ws = fs.createWriteStream(filePath);
      res.pipe(ws);
      ws.on('finish', () => { ws.close(); resolve(filePath); });
      ws.on('error', reject);
    }).on('error', reject);
  });
}

async function searchYouTube(query) {
  console.log(`[SEARCH] Mencari: ${query}`);

  const data = await postJSON(
    `https://www.youtube.com/youtubei/v1/search?key=${YT_KEY}`,
    {
      context: { client: { clientName: 'WEB', clientVersion: '2.20240101.00.00', hl: 'en', gl: 'US' } },
      query,
    }
  );

  const items = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents;
  if (!items) throw new Error('Gak ada hasil');

  for (const item of items) {
    const v = item.videoRenderer;
    if (v?.videoId) {
      const dur = v.lengthText?.simpleText || '0:00';
      const parts = dur.split(':');
      let secs = 0;
      if (parts.length === 2) secs = parseInt(parts[0]) * 60 + parseInt(parts[1]);
      else if (parts.length === 3) secs = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);

      const title = v.title?.runs?.[0]?.text || 'Unknown';
      console.log(`[SEARCH] Ditemukan: ${title} (${dur})`);

      return {
        id: v.videoId,
        title,
        duration: secs,
        thumbnail: v.thumbnail?.thumbnails?.slice(-1)?.[0]?.url || '',
        url: `https://www.youtube.com/watch?v=${v.videoId}`,
      };
    }
  }
  throw new Error('Gak ada video');
}

async function downloadAudio(query) {
  const video = await searchYouTube(query);

  if (video.duration > config.maxDuration) {
    throw new Error(`Lagu terlalu panjang (${video.duration}s). Max ${config.maxDuration}s`);
  }

  const filename = `audio_${Date.now()}_${video.id}.mp3`;
  const filePath = path.join(config.tempFolder, filename);

  console.log(`[DOWNLOAD] Getting player info: ${video.title}`);

  // Step 1: Get video player info
  const player = await postJSON(
    `https://www.youtube.com/youtubei/v1/player?key=${YT_KEY}`,
    {
      context: { client: { clientName: 'ANDROID', clientVersion: '19.09.37', androidSdkVersion: 30, hl: 'en', gl: 'US' } },
      videoId: video.id,
    }
  );

  const formats = player?.streamingData?.adaptiveFormats;
  if (!formats || formats.length === 0) {
    const reason = player?.playabilityStatus?.reason || 'Gak ada format tersedia';
    throw new Error(reason);
  }

  // Step 2: Cari audio format terbaik
  const audioFormat = formats
    .filter(f => f.mimeType?.startsWith('audio/'))
    .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];

  if (!audioFormat?.url) {
    throw new Error('Gak ada audio URL tersedia');
  }

  console.log(`[DOWNLOAD] Audio format: ${audioFormat.mimeType} (${audioFormat.bitrate}bps)`);
  console.log(`[DOWNLOAD] Downloading audio...`);

  // Step 3: Download audio
  await downloadFile(audioFormat.url, filePath);

  if (fs.existsSync(filePath)) {
    const stats = fs.statSync(filePath);
    if (stats.size > 0) {
      console.log(`[DOWNLOAD] Selesai: ${video.title} (${stats.size} bytes)`);
      return { filePath, title: video.title, duration: video.duration, url: video.url };
    }
  }

  throw new Error('File audio kosong');
}

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

function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

module.exports = { searchYouTube, downloadAudio, cleanupFile, formatDuration };

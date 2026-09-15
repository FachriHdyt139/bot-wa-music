const https = require('https');
const path = require('path');
const fs = require('fs');
const config = require('./config');

if (!fs.existsSync(config.tempFolder)) {
  fs.mkdirSync(config.tempFolder, { recursive: true });
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
      timeout: 30000,
    }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return httpGet(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

function downloadFile(url, filePath, maxRedirects = 10) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': UA },
      timeout: 120000,
    }, (res) => {
      if ((res.statusCode === 301 || res.statusCode === 302) && maxRedirects > 0) {
        return downloadFile(res.headers.location, filePath, maxRedirects - 1).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const ws = fs.createWriteStream(filePath);
      res.pipe(ws);
      ws.on('finish', () => { ws.close(); resolve(); });
      ws.on('error', reject);
    });
    req.on('error', reject);
  });
}

async function searchYouTube(query) {
  console.log(`[SEARCH] Mencari: ${query}`);

  // Pake YouTube search page langsung
  const html = await httpGet(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAQ%3D%3D`);

  // Extract video IDs dari HTML
  const videoIdRegex = /"videoId":"([a-zA-Z0-9_-]{11})"/g;
  const titleRegex = /"title":\{"runs":\[\{"text":"([^"]+)"/g;

  const videoIds = [];
  const titles = [];
  let match;

  while ((match = videoIdRegex.exec(html)) !== null) {
    if (!videoIds.includes(match[1])) videoIds.push(match[1]);
  }
  while ((match = titleRegex.exec(html)) !== null) {
    if (!titles.includes(match[1])) titles.push(match[1]);
  }

  if (videoIds.length === 0) {
    throw new Error('Gak ada hasil ditemukan');
  }

  const id = videoIds[0];
  const title = titles[0] || 'Unknown';
  console.log(`[SEARCH] Ditemukan: ${title} (ID: ${id})`);

  return {
    id,
    title,
    duration: 0,
    url: `https://www.youtube.com/watch?v=${id}`,
  };
}

async function downloadAudio(query) {
  const video = await searchYouTube(query);
  const filename = `audio_${Date.now()}_${video.id}.mp3`;
  const filePath = path.join(config.tempFolder, filename);

  console.log(`[DOWNLOAD] Trying get_video_info: ${video.id}`);

  try {
    // Method 1: get_video_info endpoint (older, less protected)
    const infoUrl = `https://www.youtube.com/get_video_info?video_id=${video.id}&el=embedded&eurl=https://www.youtube.com/&hl=en`;
    const infoData = await httpGet(infoUrl);
    const params = new URLSearchParams(infoData);
    const playerResponse = JSON.parse(params.get('player_response') || '{}');

    const formats = playerResponse?.streamingData?.adaptiveFormats;
    if (formats) {
      const audio = formats
        .filter(f => f.mimeType?.startsWith('audio/'))
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];

      if (audio?.url) {
        console.log(`[DOWNLOAD] Found audio: ${audio.mimeType}`);
        await downloadFile(audio.url, filePath);
        const stats = fs.statSync(filePath);
        console.log(`[DOWNLOAD] Selesai: ${video.title} (${stats.size} bytes)`);
        return { filePath, title: video.title, duration: video.duration, url: video.url };
      }
    }

    throw new Error('No audio format in get_video_info');
  } catch (e1) {
    console.log(`[DOWNLOAD] Method 1 failed: ${e1.message}, trying Method 2...`);

    try {
      // Method 2: Watch page
      const watchHtml = await httpGet(video.url);
      const configMatch = watchHtml.match(/var ytInitialPlayerResponse\s*=\s*(\{.+?\});/);
      if (configMatch) {
        const player = JSON.parse(configMatch[1]);
        const formats = player?.streamingData?.adaptiveFormats;
        if (formats) {
          const audio = formats
            .filter(f => f.mimeType?.startsWith('audio/'))
            .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];

          if (audio?.url) {
            console.log(`[DOWNLOAD] Found audio via watch page`);
            await downloadFile(audio.url, filePath);
            const stats = fs.statSync(filePath);
            console.log(`[DOWNLOAD] Selesai: ${video.title} (${stats.size} bytes)`);
            return { filePath, title: video.title, duration: video.duration, url: video.url };
          }
        }
      }
      throw new Error('No audio in watch page');
    } catch (e2) {
      console.log(`[DOWNLOAD] Method 2 failed: ${e2.message}, trying Method 3...`);

      try {
        // Method 3: Embed page
        const embedHtml = await httpGet(`https://www.youtube.com/embed/${video.id}`);
        const embedMatch = embedHtml.match(/"adaptiveFormats":(\[.+?\])/);
        if (embedMatch) {
          const formats = JSON.parse(embedMatch[1]);
          const audio = formats
            .filter(f => f.mimeType?.startsWith('audio/'))
            .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];

          if (audio?.url) {
            console.log(`[DOWNLOAD] Found audio via embed page`);
            await downloadFile(audio.url, filePath);
            const stats = fs.statSync(filePath);
            console.log(`[DOWNLOAD] Selesai: ${video.title} (${stats.size} bytes)`);
            return { filePath, title: video.title, duration: video.duration, url: video.url };
          }
        }
        throw new Error('No audio in embed page');
      } catch (e3) {
        throw new Error(`Semua method gagal. YouTube blocking download dari server ini.`);
      }
    }
  }
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

const https = require('https');
const path = require('path');
const fs = require('fs');
const config = require('./config');

if (!fs.existsSync(config.tempFolder)) {
  fs.mkdirSync(config.tempFolder, { recursive: true });
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': UA, ...headers },
      timeout: 30000,
    }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return httpGet(res.headers.location, headers).then(resolve).catch(reject);
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

  const html = await httpGet(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAQ%3D%3D`);

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

  console.log(`[DOWNLOAD] Using RapidAPI for: ${video.title}`);

  try {
    const rapidApiKey = process.env.RAPIDAPI_KEY;
    if (!rapidApiKey) {
      throw new Error('RAPIDAPI_KEY not set in .env');
    }

    const apiUrl = `https://youtube-mp36.p.rapidapi.com/dl?id=${video.id}`;
    const response = await httpGet(apiUrl, {
      'x-rapidapi-host': 'youtube-mp36.p.rapidapi.com',
      'x-rapidapi-key': rapidApiKey,
    });

    console.log(`[DOWNLOAD] RapidAPI response: ${response.substring(0, 200)}`);

    const data = JSON.parse(response);

    if (data.link) {
      console.log(`[DOWNLOAD] Got download link!`);
      await downloadFile(data.link, filePath);

      const stats = fs.statSync(filePath);
      console.log(`[DOWNLOAD] Selesai: ${video.title} (${stats.size} bytes)`);
      return { filePath, title: video.title, duration: video.duration, url: video.url };
    }

    throw new Error(data.error || 'No download link in response');
  } catch (err) {
    throw new Error(`Download gagal: ${err.message}`);
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

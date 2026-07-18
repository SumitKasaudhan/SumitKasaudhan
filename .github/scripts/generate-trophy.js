const https = require('https');
const fs = require('fs');
const path = require('path');

const username = process.env.GH_USERNAME || 'SumitKasaudhan';
const token = process.env.GH_TOKEN || '';
const outDir = process.env.OUT_DIR || 'dist';
const outFile = path.join(outDir, 'trophy.svg');

const theme = { bg: '#1a1b27', title: '#fe428e', text: '#a9fef7', box: '#232333' };

// tier -> color (grey -> bronze -> silver -> gold -> bright gold -> legendary purple)
const tierColors = {
  C: '#9ca3af',
  B: '#cd7f32',
  A: '#d7d9db',
  AA: '#ffd700',
  AAA: '#ffb800',
  SSS: '#c084fc',
};

function rank(value, thresholds) {
  const tiers = ['C', 'B', 'A', 'AA', 'AAA', 'SSS'];
  let idx = 0;
  for (let i = 0; i < thresholds.length; i++) {
    if (value >= thresholds[i]) idx = i + 1;
  }
  return tiers[Math.min(idx, tiers.length - 1)];
}

function buildSvg(stats) {
  const boxW = 84, boxH = 84, gap = 12, startX = 20, startY = 44;
  const width = startX * 2 + stats.length * boxW + (stats.length - 1) * gap;
  const height = startY + boxH + 16;

  let defs = '';
  let boxesSvg = '';

  stats.forEach((s, i) => {
    const x = startX + i * (boxW + gap);
    const color = tierColors[s.rank] || theme.text;
    const isLegendary = s.rank === 'SSS';
    let rankFill = color;

    if (isLegendary) {
      const gradId = `legendary-${i}`;
      defs += `<linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="100%">` +
        `<stop offset="0%" stop-color="#8E2DE2"/>` +
        `<stop offset="100%" stop-color="#c084fc"/>` +
        `</linearGradient>`;
      rankFill = `url(#${gradId})`;
    }

    boxesSvg += `<g>` +
      `<rect x="${x}" y="${startY}" width="${boxW}" height="${boxH}" rx="6" fill="${theme.box}" stroke="${color}" stroke-width="1.5" ${isLegendary ? `opacity="0.95"` : ''}/>` +
      `<text x="${x + boxW / 2}" y="${startY + 20}" text-anchor="middle" font-size="10" fill="${theme.text}" font-family="Segoe UI, sans-serif">${s.label}</text>` +
      `<text x="${x + boxW / 2}" y="${startY + 52}" text-anchor="middle" font-size="26" font-weight="800" fill="${rankFill}" font-family="Segoe UI, sans-serif">${s.rank}</text>` +
      `<text x="${x + boxW / 2}" y="${startY + 70}" text-anchor="middle" font-size="11" fill="${theme.text}" font-family="Segoe UI, sans-serif">${s.value}</text>` +
      `</g>`;
  });

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">` +
    `<defs>${defs}</defs>` +
    `<rect width="${width}" height="${height}" rx="8" fill="${theme.bg}"/>` +
    `<text x="20" y="26" font-size="15" font-weight="600" fill="${theme.title}" font-family="Segoe UI, sans-serif">${username} GitHub trophies</text>` +
    boxesSvg +
    `</svg>`;
}

function ghGet(apiPath) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'api.github.com',
      path: apiPath,
      headers: {
        'User-Agent': 'trophy-script',
        Accept: 'application/vnd.github+json',
        ...(token ? { Authorization: `token ${token}` } : {}),
      },
    };
    const req = https.get(options, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, body: null, parseError: e.message });
        }
      });
    });
    req.on('error', (e) => resolve({ status: 0, body: null, error: e.message }));
    req.setTimeout(15000, () => {
      req.destroy();
      resolve({ status: 0, body: null, error: 'timeout after 15s' });
    });
  });
}

function writeSvg(stats) {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, buildSvg(stats));
  console.log(`Wrote ${outFile} (${fs.statSync(outFile).size} bytes) with stats:`, JSON.stringify(stats));
}

function fallbackStats(reason) {
  console.error('Falling back to zero-stats trophy. Reason:', reason);
  return [
    { label: 'Stars', value: 0, rank: 'C' },
    { label: 'Repos', value: 0, rank: 'C' },
    { label: 'Followers', value: 0, rank: 'C' },
    { label: 'Years', value: 0, rank: 'C' },
  ];
}

async function main() {
  try {
    const userRes = await ghGet(`/users/${username}`);
    console.log('user API status:', userRes.status, userRes.error || '');

    const repoRes = await ghGet(`/users/${username}/repos?per_page=100`);
    console.log('repos API status:', repoRes.status, repoRes.error || '');

    const user = userRes.body;
    const repos = repoRes.body;

    if (!user || userRes.status !== 200) {
      writeSvg(fallbackStats(`user API returned status ${userRes.status}: ${JSON.stringify(user)}`));
      return;
    }

    let totalStars = 0;
    if (Array.isArray(repos)) {
      totalStars = repos.reduce((sum, r) => sum + (r.stargazers_count || 0), 0);
    }
    const publicRepos = user.public_repos || 0;
    const followers = user.followers || 0;
    let years = 0;
    if (user.created_at) {
      const created = new Date(user.created_at).getTime();
      if (!isNaN(created)) {
        years = Math.floor((Date.now() - created) / (365.25 * 24 * 3600 * 1000));
      }
    }

    const stats = [
      { label: 'Stars', value: totalStars, rank: rank(totalStars, [5, 15, 40, 100, 300]) },
      { label: 'Repos', value: publicRepos, rank: rank(publicRepos, [5, 15, 30, 60, 120]) },
      { label: 'Followers', value: followers, rank: rank(followers, [5, 15, 40, 100, 300]) },
      { label: 'Years', value: years, rank: rank(years, [1, 2, 4, 7, 10]) },
    ];
    writeSvg(stats);
  } catch (e) {
    writeSvg(fallbackStats(e && e.stack));
  }
}

main();

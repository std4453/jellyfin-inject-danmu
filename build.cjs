const fs = require('node:fs');
fs.mkdirSync('dist', { recursive: true });
for (const file of ['inject-danmu.js', 'inject-danmu-badge.js']) fs.copyFileSync(file, `dist/${file}`);
fs.copyFileSync('node_modules/danmaku/dist/danmaku.min.js', 'dist/danmaku.min.js');

const { execSync } = require('child_process');

// 自动关闭旧进程
try {
  const out = execSync('netstat -ano | find ":3001" | find "LISTENING"', { encoding: 'utf8', timeout: 3000 });
  const pid = out.trim().split(/\s+/).pop();
  if (pid) {
    execSync(`taskkill /f /pid ${pid}`, { timeout: 3000 });
    console.log('Closed old process on :3001');
  }
} catch {}

require('./service/browser-proxy.js');

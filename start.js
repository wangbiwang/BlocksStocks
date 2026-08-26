/**
 * 启动入口：自动关闭旧进程 → 检测问财登录态（无 cookie 时弹出登录）→ 启动代理服务
 * 用法:
 *   node start.js          # 无 cookie 时自动登录，有 cookie 直接启动
 *   node start.js --login  # 强制重新登录后再启动
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 自动关闭旧进程
try {
  const out = execSync('netstat -ano | find ":3001" | find "LISTENING"', { encoding: 'utf8', timeout: 3000 });
  const pid = out.trim().split(/\s+/).pop();
  if (pid) {
    execSync(`taskkill /f /pid ${pid}`, { timeout: 3000 });
    console.log('Closed old process on :3001');
  }
} catch {}

(async () => {
  const COOKIE_FILE = path.join(__dirname, 'data', 'iwencai-cookies.json');
  const needLogin = process.argv.includes('--login') || !fs.existsSync(COOKIE_FILE);

  if (needLogin) {
    console.log('未检测到问财登录 cookies，先弹出登录窗口...');
    try {
      const { loginAndSaveCookies } = require('./v8/login.js');
      const ok = await loginAndSaveCookies();
      if (!ok) console.log('登录未完成，继续启动服务（查询可能返回 401，可用 node start.js --login 重试）');
    } catch (e) {
      console.error('登录失败:', e.message);
      console.log('继续启动服务（查询可能返回 401，可用 node start.js --login 重试）');
    }
  } else {
    console.log('检测到问财登录 cookies，直接启动服务');
  }

  require('./service/browser-proxy.js');
})();

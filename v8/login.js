/**
 * 问财登录辅助：弹出浏览器窗口，用户登录同花顺问财后自动保存 cookies
 * 用法:
 *   node v8/login.js                # 直接运行（登录后退出）
 *   node start.js                   # 启动服务前自动检测并登录（无 cookie 时）
 *   node start.js --login           # 强制重新登录
 * cookies 保存到 data/iwencai-cookies.json，服务启动时自动注入
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const COOKIE_FILE = path.join(__dirname, '../data/iwencai-cookies.json');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

async function loginAndSaveCookies() {
  console.log('启动浏览器窗口，请在窗口中登录同花顺问财（扫码或账号密码）...');
  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const context = await browser.newContext({ userAgent: UA, viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await page.goto('https://www.iwencai.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });

  for (let i = 0; i < 120; i++) {
    await page.waitForTimeout(3000);
    const loggedIn = await page.evaluate(() => {
      const els = [...document.querySelectorAll('*')].filter(el =>
        el.children.length === 0 && el.textContent.trim() === '登录' &&
        el.offsetParent !== null && el.tagName !== 'HTML' && el.tagName !== 'BODY'
      );
      const hasAvatar = !!document.querySelector('.avatar, [class*="avatar"]');
      return els.length === 0 && hasAvatar;
    }).catch(() => false);

    if (loggedIn) {
      console.log('检测到已登录，保存 cookies...');
      const cookies = await context.cookies();
      fs.mkdirSync(path.dirname(COOKIE_FILE), { recursive: true });
      fs.writeFileSync(COOKIE_FILE, JSON.stringify(cookies, null, 2), 'utf8');
      console.log('已保存', cookies.length, '条 cookies 到', COOKIE_FILE);
      await browser.close();
      return true;
    }
    if (i % 5 === 0) console.log('等待登录中...（' + ((i + 1) * 3) + '秒）');
  }
  console.log('超时未检测到登录，请重试');
  await browser.close();
  return false;
}

module.exports = { loginAndSaveCookies, COOKIE_FILE };

if (require.main === module) {
  loginAndSaveCookies().catch(e => { console.error('登录失败:', e.message); process.exit(1); });
}

/**
 * 问财登录辅助脚本：弹出浏览器窗口，用户登录同花顺问财后自动保存 cookies
 * 运行: node v8/login.js
 * 登录完成后 cookies 保存到 data/iwencai-cookies.json，重启服务即生效
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const COOKIE_FILE = path.join(__dirname, '../data/iwencai-cookies.json');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

(async () => {
  console.log('启动浏览器窗口，请在窗口中登录同花顺问财（扫码或账号密码）...');
  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const context = await browser.newContext({ userAgent: UA, viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await page.goto('https://www.iwencai.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });

  // 轮询检测登录状态：顶部"登录"入口消失即视为已登录
  for (let i = 0; i < 120; i++) {
    await page.waitForTimeout(3000);
    const loggedIn = await page.evaluate(() => {
      // 找可见的、文本恰好为"登录"的叶子元素（登录按钮）
      const els = [...document.querySelectorAll('*')].filter(el =>
        el.children.length === 0 && el.textContent.trim() === '登录' &&
        el.offsetParent !== null && el.tagName !== 'HTML' && el.tagName !== 'BODY'
      );
      // 也检测是否出现用户头像/用户名（登录后顶部区域变化）
      const hasAvatar = !!document.querySelector('.avatar, [class*="avatar"]');
      return els.length === 0 && hasAvatar;
    }).catch(() => false);

    if (loggedIn) {
      console.log('检测到已登录，保存 cookies...');
      const cookies = await context.cookies();
      fs.mkdirSync(path.dirname(COOKIE_FILE), { recursive: true });
      fs.writeFileSync(COOKIE_FILE, JSON.stringify(cookies, null, 2), 'utf8');
      console.log('已保存', cookies.length, '条 cookies 到', COOKIE_FILE);
      console.log('请重启服务（node start.js）使登录态生效');
      await browser.close();
      return;
    }
    if (i % 5 === 0) console.log('等待登录中...（' + ((i + 1) * 3) + '秒）');
  }
  console.log('超时未检测到登录，请重试');
  await browser.close();
})().catch(e => { console.error('登录失败:', e.message); process.exit(1); });

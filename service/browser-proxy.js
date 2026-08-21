/**
 * V5 浏览器代理
 * Playwright Chromium → iwencai.com 同源 XHR（chameleon 自动注入 hexin-v）
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

// 缓存目录（绝对路径避免 __dirname 歧义）
const CACHE_DIR = path.join(__dirname, '../v8/cache');
if (!fs.existsSync(CACHE_DIR)) {
  try { fs.mkdirSync(CACHE_DIR, { recursive: true }); } catch (e) { console.log('Cache dir error:', e.message); }
}

const PORT = 3001;
const PROXY_FILE = path.join(__dirname, '../v8/proxies.json');

let browser, context, page;
let isReady = false;
let proxyIndex = 0;
let proxyList = [];

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

// ===== 代理管理器 =====
const PROXY_SOURCES = [
  'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=10000&country=all',
  'https://www.proxynova.com/proxy-server-list/country-cn/',
];

async function fetchProxyList() {
  const all = [];
  // 加载本地缓存
  try {
    if (fs.existsSync(PROXY_FILE)) {
      const cached = JSON.parse(fs.readFileSync(PROXY_FILE, 'utf8'));
      if (Array.isArray(cached)) all.push(...cached);
    }
  } catch (e) {}

  // 抓取在线代理
  for (const url of PROXY_SOURCES) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
      const txt = await resp.text();
      const matches = txt.match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d{2,5}\b/g);
      if (matches) all.push(...matches);
    } catch (e) {
      console.log('Proxy fetch failed:', url.split('/').pop(), e.message.substring(0, 40));
    }
  }

  // 去重
  const unique = [...new Set(all)];
  if (unique.length > 0) {
    proxyList = unique;
    try { fs.writeFileSync(PROXY_FILE, JSON.stringify(proxyList, null, 2)); } catch (e) {}
    console.log('Proxy list:', proxyList.length, 'proxies');
  } else {
    console.log('No online proxies, using cached:', proxyList.length);
  }
}

function getNextProxy() {
  if (proxyList.length === 0) return null;
  const p = proxyList[proxyIndex % proxyList.length];
  proxyIndex++;
  return p;
}

async function initBrowser() {
  console.log('Starting browser...');

  // 尝试用代理启动（最多尝试 3 个代理）
  for (let attempt = 0; attempt < Math.max(1, proxyList.length); attempt++) {
    const proxy = proxyList.length > 0 ? getNextProxy() : null;
    if (proxy) console.log('Trying proxy:', proxy);

    try {
      browser = await chromium.launch({
        headless: true,
        args: [
          '--disable-blink-features=AutomationControlled',
          '--no-sandbox',
          ...(proxy ? [`--proxy-server=http://${proxy}`] : []),
        ],
      });

      context = await browser.newContext({
        userAgent: UA,
        viewport: { width: 1920, height: 1080 },
        ...(proxy ? { proxy: { server: `http://${proxy}` } } : {}),
      });

      await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        window.chrome = { runtime: {} };
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
        Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh', 'en'] });
      });

      page = await context.newPage();
      page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
      page.on('crash', () => {
    console.log('PAGE CRASHED! restarting...');
    isReady = false;
    // 自动重启
    (async () => {
      try { await browser.close(); } catch (e) {}
      await new Promise(r => setTimeout(r, 3000));
      await initBrowser();
    })();
  });
      page.on('console', msg => { if (msg.type() === 'error') console.log('PAGE CONSOLE ERROR:', msg.text()); });
      console.log('Loading iwencai.com...');
      for (let retry = 0; retry < 3; retry++) {
        try {
          await page.goto('https://www.iwencai.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
          break;
        } catch (e) {
          if (retry < 2) { console.log(`Retry ${retry + 1}/2: ${e.message?.substring(0,60)}`); await new Promise(r=>setTimeout(r,3000)); }
          else throw e;
        }
      }
      await page.waitForTimeout(5000);

      isReady = true;
      console.log('Ready' + (proxy ? ' via ' + proxy : ' (direct)'));

      setInterval(async () => {
        try { await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 }); await page.waitForTimeout(4000); } catch (e) {}
      }, 30 * 60 * 1000);

      return; // 成功启动，退出重试循环
    } catch (e) {
      const msg = e.message || '';
      if (msg.includes('ERR_PROXY_CONNECTION_FAILED') || msg.includes('Forbidden') || msg.includes('403')) {
        console.log('Proxy failed, try next:', proxy || 'direct');
        try { if (browser) await browser.close(); } catch (ex) {}
        continue;
      }
      throw e; // 非代理错误，直接抛出
    }
  }
  if (!isReady) throw new Error('All proxies failed');
}

async function queryAPI(question, type = 'zhishu', perpage = 100, pageNum = 1) {
  if (!isReady) throw new Error('Not ready');

  try {
    const result = await page.evaluate(async (params) => {
      // 第一步：发起查询
      const firstResp = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/customized/chart/get-robot-data', true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.timeout = 20000;
        xhr.onload = () => {
          try { resolve(JSON.parse(xhr.responseText)); }
          catch (e) {
            const preview = (xhr.responseText || '').substring(0, 300);
            reject(new Error('iwencai返回非JSON: ' + preview));
          }
        };
        xhr.onerror = () => reject(new Error('network error'));
        xhr.ontimeout = () => reject(new Error('timeout'));
        xhr.send(JSON.stringify({
          source: 'Ths_iwencai_Xuangu', version: '2.0',
          question: params.question, perpage: params.perpage, page: params.pageNum,
          secondary_intent: params.type,
          add_info: '{"urp":{"scene":1,"company":1,"business":1},"contentType":"json","searchInfo":true}',
          log_info: '{"input_type":"typewrite"}',
        }));
      });

      if (firstResp.status_code !== 0) {
        return { status: 200, data: [], _raw: firstResp, error: firstResp.status_msg };
      }

      // 遍历所有组件，找第一个有数据的 xuangu_tableV1
      const comps = firstResp?.data?.answer?.[0]?.txt?.[0]?.content?.components || [];
      let comp = comps[0], showType = '', footerUrl = '', datas = [];
      for (const c of comps) {
        if (c.data?.datas?.length > 0 && (c.show_type === 'xuangu_tableV1' || c.show_type === 'common')) {
          comp = c; datas = c.data.datas; showType = c.show_type;
          footerUrl = c.config?.other_info?.footer_info?.url || '';
          break;
        }
      }

      // 非 xuangu_tableV1 或第一页：直接返回
      if (showType !== 'xuangu_tableV1' || params.pageNum === 1) {
        return { status: 200, data: datas, _raw: firstResp };
      }

      // xuangu_tableV1 分页：使用 footer URL
      if (!footerUrl) {
        return { status: 200, data: [], _raw: firstResp };
      }

      // 替换 footer URL 中的 page 参数
      const pagedUrl = footerUrl.replace(/page=\d+/, 'page=' + params.pageNum)
                               .replace(/perpage=\d+/, 'perpage=' + params.perpage);

      const pageResp = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', pagedUrl, true);
        xhr.timeout = 20000;
        xhr.onload = () => {
          try { resolve(JSON.parse(xhr.responseText)); }
          catch (e) {
            const preview = (xhr.responseText || '').substring(0, 300);
            reject(new Error('iwencai返回非JSON: ' + preview));
          }
        };
        xhr.onerror = () => reject(new Error('network error'));
        xhr.ontimeout = () => reject(new Error('timeout'));
        xhr.send();
      });

      // 提取数据（footer URL 响应）
      const footerDatas = pageResp?.answer?.components?.[0]?.data?.datas
        || pageResp?.data?.list
        || [];
      return { status: 200, data: Array.isArray(footerDatas) ? footerDatas : [], _raw: pageResp };

    }, { question, type, perpage, pageNum });

    return result;
  } catch (err) {
    console.log('Query failed, reloading page:', err.message.substring(0, 120));
    try {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(5000);
      return queryAPI(question, type, perpage, pageNum);
    } catch {
      throw err;
    }
  }
}

// Express
const app = express();
app.use(express.json({ limit: '2mb' }));
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.get('/api/health', (req, res) => {
  res.json({ status: isReady ? 'ok' : 'initializing' });
});

app.post('/api/reload', async (req, res) => {
  try {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);
    res.json({ status: 'ok' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function extractDate(question) {
  // 先找 "YYYYMMDD 09:" → td 日期（q0 的格式）
  let m = question.match(/\b(\d{8}) 09:/);
  if (m) return m[1];
  // 再找 "YYYYMMDD涨跌幅" 但不跟"降序"（= td 日期）
  m = question.match(/\b(\d{8})涨跌幅(?!降序)/);
  if (m) return m[1];
  // 最后取第一个 8 位数字
  m = question.match(/\b(\d{8})\b/);
  return m ? m[1] : 'unknown';
}

function extractType(question) {
  if (question.includes('二级行业')) return '行业';
  if (question.includes('概念') && !question.includes('所属概念')) return '概念';
  return 'stock';
}

function cacheKey(question, type, perpage, page) {
  const td = extractDate(question);
  // 构建文件夹路径: {td}/{type}/{blockName}/
  let sub = '';
  if (type === 'stock' || question.includes('所属行业') || question.includes('所属概念')) {
    const m = question.match(/所属(行业|概念)包含([^;]+)/);
    const bt = m ? (m[1] === '行业' ? '行业' : '概念') : 'unknown';
    const bn = m ? m[2].replace(/[^a-zA-Z0-9_一-鿿]/g, '_').slice(0, 30) : 'all';
    sub = path.join(td, 'stock', `${bt}-${bn}`);
  } else {
    sub = path.join(td, extractType(question).replace(/[^a-zA-Z0-9_一-鿿]/g, '_'));
  }
  const dir = path.join(CACHE_DIR, sub);
  if (!fs.existsSync(dir)) {
    try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { console.log('Cache mkdir error:', e.message); }
  }
  // 文件名用 hash
  const s = `${type}|${perpage}|${page}|${question}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
  const sig = question.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30);
  return path.join(dir, `${h}_q${page}_${sig}.json`);
}

app.post('/api/query', async (req, res) => {
  const { question, type, perpage, page, nocache } = req.body;
  if (!question) return res.status(400).json({ error: 'missing question' });
  const cacheFile = cacheKey(question, type || 'zhishu', perpage || 100, page || 1);

  // 非重试 + 有缓存 → 直接返回
  if (!nocache && fs.existsSync(cacheFile)) {
    try {
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      cached._cached = true;
      console.log('Cache hit:', path.basename(cacheFile));
      return res.json(cached);
    } catch (e) {
      console.log('Cache read error, re-fetch:', e.message);
    }
  }

  try {
    const start = Date.now();
    const result = await queryAPI(question, type || 'zhishu', perpage || 100, page || 1);
    result.latency = Date.now() - start;
    result._cached = false;

    // 成功且非重试 → 保存缓存
    if (result.data && result.data.length > 0) {
      try {
        const dataStr = JSON.stringify(result, null, 2);
        fs.writeFileSync(cacheFile, dataStr, 'utf8');
        console.log('Cache saved:', path.basename(cacheFile), 'size:', dataStr.length);
      } catch (e) {
        console.log('Cache write error:', path.basename(cacheFile), e.message);
      }
    } else {
      console.log('Cache skip - no data:', typeof result.data, result.data ? result.data.length : 0);
    }

    res.json(result);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});


// V8 预筛缓存保存
const PRESET_DIR = path.join(__dirname, '../data/preset');
app.post('/api/preset', (req, res) => {
  const { targetDate, blocks, stocks, meta } = req.body || {};
  if (!targetDate || !Array.isArray(blocks)) return res.status(400).json({ error: 'bad payload' });
  try {
    if (!fs.existsSync(PRESET_DIR)) fs.mkdirSync(PRESET_DIR, { recursive: true });
    const file = path.join(PRESET_DIR, `${targetDate}.json`);
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ ...req.body, savedAt: new Date().toISOString() }, null, 2), 'utf8');
    fs.renameSync(tmp, file);
    res.json({ ok: true, file: `${targetDate}.json`, blocks: blocks.length, stocks: (stocks || []).length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// 数据目录
app.use('/data', express.static(path.join(__dirname, '../data')));
// V7 静态文件（根路径）
app.use(express.static(path.join(__dirname, '../v8')));
// V6 手机版
app.use('/m', express.static(path.join(__dirname, '../v8/mobile')));

async function start() {
  await fetchProxyList();
  await initBrowser();
  app.listen(PORT, () => {
    console.log('V5 ready: http://localhost:' + PORT);
  });
}

process.on('SIGINT', async () => {
  if (context) try { await context.close(); } catch {}
  if (browser) try { await browser.close(); } catch {}
  process.exit(0);
});

start();

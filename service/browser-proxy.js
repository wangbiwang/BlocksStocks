/**
 * V5 浏览器代理
 * Playwright Chromium → iwencai.com 同源 XHR（chameleon 自动注入 hexin-v）
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

// 缓存目录（绝对路径避免 __dirname 歧义）
const CACHE_DIR = path.join(__dirname, '../v7/cache');
if (!fs.existsSync(CACHE_DIR)) {
  try { fs.mkdirSync(CACHE_DIR, { recursive: true }); } catch (e) { console.log('Cache dir error:', e.message); }
}

const PORT = 3001;

let browser, context, page;
let isReady = false;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

async function initBrowser() {
  console.log('Starting browser...');
  browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
  });
  context = await browser.newContext({
    userAgent: UA,
    viewport: { width: 1920, height: 1080 },
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    window.chrome = { runtime: {} };
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh', 'en'] });
  });

  page = await context.newPage();
  console.log('Loading iwencai.com...');
  // 带重试的页面加载
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
  console.log('Ready');

  // 每 30 分钟刷新保持会话
  setInterval(async () => {
    try {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(4000);
    } catch (e) {}
  }, 30 * 60 * 1000);
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
          catch (e) { reject(new Error('parse error')); }
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
          catch (e) { reject(new Error('parse error')); }
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
    console.log('Query failed, reloading page:', err.message);
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

// 数据目录
app.use('/data', express.static(path.join(__dirname, '../data')));
// V7 静态文件（根路径）
app.use(express.static(path.join(__dirname, '../v7')));
// V6 手机版
app.use('/m', express.static(path.join(__dirname, '../v6/mobile')));

async function start() {
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

/**
 * A股数据采集脚本 v2
 * 收集：3041 只 A 股 + 自动从股票数据提取行业/概念列表 + 关联索引
 *
 * 运行：node collect-data.js  （需要先 node start 启动 browser-proxy）
 * 输出：data/latest.json
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const API_HOST = 'localhost';
const API_PORT = 3001;
const PERPAGE = 30; // iwencai 分页接口限制
const DATA_DIR = path.join(__dirname, 'data');

function apiQuery(question, type = 'stock', perpage = PERPAGE, page = 1) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ question, type, perpage, page });
    const req = http.request({
      hostname: API_HOST, port: API_PORT, path: '/api/query', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 30000,
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('parse error')); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('A股数据采集 v2');
  console.log('时间:', new Date().toLocaleString());
  console.log('每页:', PERPAGE, '条\n');

  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  // 检查服务
  try { await apiQuery('上证指数', 'zhishu', 1); }
  catch (e) {
    console.error('无法连接 browser-proxy (:3001)，请先运行 node start');
    process.exit(1);
  }

  // ===== 收集所有股票 =====
  console.log('=== 收集 A 股股票 ===');
  const stocks = [];
  const seenCodes = new Set();
  // 字段规范决定返回哪些列，必须包含行业/概念字段
  const STOCK_Q = '全部A股;涨跌幅降序;所属行业;所属概念;二级行业;三级行业;上市板块';
  let totalReported = 0;
  let consecutiveEmpty = 0;

  const startPage = parseInt(process.argv[2]) || 1;

  for (let p = startPage; p <= 200; p++) {
    // 每 50 页刷新一次浏览器页面（避免会话过期）
    if (p > 1 && p % 50 === 0) {
      console.log('  🔄 刷新浏览器会话...');
      await new Promise((resolve, reject) => {
        const req = http.request({
          hostname: API_HOST, port: API_PORT, path: '/api/reload', method: 'POST',
          headers: { 'Content-Length': '0' }, timeout: 35000,
        }, (res) => { res.on('end', resolve); res.resume(); });
        req.on('error', reject);
        req.end();
      });
      await sleep(3000);
    }

    // 带重试的请求
    let r = null;
    for (let retry = 0; retry < 3; retry++) {
      r = await apiQuery(STOCK_Q, 'stock', PERPAGE, p);
      if (r.data?.length > 0) break;
      if (retry < 2) { console.log(`  第${p}页重试...`); await sleep(2000); }
    }

    if (!r?.data?.length) {
      consecutiveEmpty++;
      if (consecutiveEmpty >= 2) { console.log('  连续空页，停止'); break; }
      continue;
    }
    consecutiveEmpty = 0;

    // 去重（部分分页可能返回重复数据）
    const newItems = r.data.filter(d => {
      const code = d['股票代码'] || d.code;
      if (!code || seenCodes.has(code)) return false;
      seenCodes.add(code);
      return true;
    });

    stocks.push(...newItems);

    if (p === 1 || !totalReported) {
      totalReported = r._raw?.data?.answer?.[0]?.txt?.[0]?.content?.components?.[0]
        ?.data?.meta?.extra?.row_count || totalReported;
    }

    console.log(`  第${p}页: ${newItems.length} 条 (累计 ${stocks.length}${totalReported ? '/' + totalReported : ''})`);
    if (r.data.length < PERPAGE) break;
    await sleep(800);
  }

  console.log(`  共 ${stocks.length} 只股票`);

  // ===== 从股票数据提取行业/概念列表 + 建立关联索引 =====
  console.log('\n=== 建立索引 & 提取分类 ===');

  const indexByCode = {};
  const ind2Set = new Map();  // name → Set of codes
  const ind3Set = new Map();
  const conceptSet = new Map();

  for (const s of stocks) {
    const code = s['股票代码'] || s.code;
    if (!code) continue;
    indexByCode[code] = s;

    const i2 = s['所属同花顺二级行业'];
    if (i2) {
      if (!ind2Set.has(i2)) ind2Set.set(i2, new Set());
      ind2Set.get(i2).add(code);
    }

    const i3 = s['所属同花顺三级行业'];
    if (i3) {
      if (!ind3Set.has(i3)) ind3Set.set(i3, new Set());
      ind3Set.get(i3).add(code);
    }

    const concepts = s['所属概念'];
    if (concepts) {
      concepts.split(';').forEach(c => {
        const cn = c.trim();
        if (cn) {
          if (!conceptSet.has(cn)) conceptSet.set(cn, new Set());
          conceptSet.get(cn).add(code);
        }
      });
    }
  }

  // 转换为普通对象（JSON 友好）
  const stocksByIndustry2 = {};
  for (const [name, codes] of ind2Set) {
    stocksByIndustry2[name] = [...codes];
  }

  const stocksByIndustry3 = {};
  for (const [name, codes] of ind3Set) {
    stocksByIndustry3[name] = [...codes];
  }

  const stocksByConcept = {};
  for (const [name, codes] of conceptSet) {
    stocksByConcept[name] = [...codes];
  }

  console.log(`  股票索引:     ${Object.keys(indexByCode).length}`);
  console.log(`  二级行业:     ${Object.keys(stocksByIndustry2).length} 个`);
  console.log(`  三级行业:     ${Object.keys(stocksByIndustry3).length} 个`);
  console.log(`  概念板块:     ${Object.keys(stocksByConcept).length} 个`);

  // 统计分布
  const i2Sizes = Object.entries(stocksByIndustry2).map(([k, v]) => ({ name: k, count: v.length }));
  i2Sizes.sort((a, b) => b.count - a.count);
  console.log('\n  二级行业 Top 10:');
  i2Sizes.slice(0, 10).forEach(i => console.log(`    ${i.name}: ${i.count} 只`));

  // ===== 清洗：去掉每日变动的字段 =====
  console.log('\n=== 清洗数据 ===');
  const volatileKeys = ['涨跌幅','排名','收盘价','开盘价','最高价','最低价','成交量','振幅','最新价','市盈率','大单净额','前复权','不复权','资金流向','最新dde'];
  const beforeSize = JSON.stringify(stocks).length;
  for (const s of stocks) {
    for (const k of Object.keys(s)) {
      if (volatileKeys.some(v => k.includes(v))) delete s[k];
      else if (/\[\d{8}\]$/.test(k)) {  // 去日期后缀
        s[k.replace(/\[\d{8}\]$/, '')] = s[k];
        delete s[k];
      }
    }
  }
  const afterSize = JSON.stringify(stocks).length;
  console.log(`  ${(beforeSize/1024/1024).toFixed(1)}MB → ${(afterSize/1024/1024).toFixed(1)}MB`);
  console.log(`  保留字段: ${Object.keys(stocks[0]).join(', ')}`);

  // ===== 保存 =====
  const result = {
    collectedAt: new Date().toISOString(),
    totalStocks: stocks.length,
    stocks,
    industries2: Object.keys(stocksByIndustry2).sort(),        // 二级行业列表
    industries3: Object.keys(stocksByIndustry3).sort(),        // 三级行业列表
    concepts: Object.keys(stocksByConcept).sort(),             // 概念列表
    indexByCode,
    stocksByIndustry2,
    stocksByIndustry3,
    stocksByConcept,
  };

  const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `a-stock-data-${dateStr}.json`;
  const filepath = path.join(DATA_DIR, filename);

  fs.writeFileSync(filepath, JSON.stringify(result, null, 2), 'utf-8');
  fs.writeFileSync(path.join(DATA_DIR, 'latest.json'), JSON.stringify(result, null, 2), 'utf-8');

  // 统计文件大小
  const sizeMB = (fs.statSync(filepath).size / 1024 / 1024).toFixed(1);

  console.log(`\n✅ ${filename}  (${sizeMB} MB)`);
  console.log(`   股票: ${stocks.length} | 二级行业: ${Object.keys(stocksByIndustry2).length} | 三级行业: ${Object.keys(stocksByIndustry3).length} | 概念: ${Object.keys(stocksByConcept).length}`);
  console.log(`   下次更新: node collect-data.js`);
}

main().catch(e => { console.error('失败:', e.message); process.exit(1); });

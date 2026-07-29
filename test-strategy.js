/**
 * V6 策略自测脚本
 * 用法: node test-strategy.js
 * 新增用例: 在 CASES 数组中添加即可
 */
const BASE = 'http://localhost:3001';

// ======================== 测试用例 ========================
const CASES = [
    { td: '20240103', pd1: '20240102', pd2: '20231229', pd3: '20231228', nd1: '20240104', block: '旅游及酒店', type: '行业', stock: '长白山' },
    { td: '20240516', pd1: '20240515', pd2: '20240514', pd3: '20240513', nd1: '20240517', block: '房地产', type: '行业', stock: '我爱我家' },
    { td: '20240711', pd1: '20240710', pd2: '20240709', pd3: '20240708', nd1: '20240712', block: '网约车', type: '概念', stock: '大众交通' },
    { td: '20240816', pd1: '20240815', pd2: '20240814', pd3: '20240813', nd1: '20240819', block: '华为海思概念股', type: '概念', stock: '深圳华强' },
    { td: '20241101', pd1: '20241031', pd2: '20241030', pd3: '20241029', nd1: '20241104', block: '小金属', type: '行业', stock: '云南锗业' },
    { td: '20241101', pd1: '20241031', pd2: '20241030', pd3: '20241029', nd1: '20241104', block: '光刻机', type: '概念', stock: '海立股份' },
    { td: '20240301', pd1: '20240229', pd2: '20240228', pd3: '20240227', nd1: '20240304', block: '液冷服务器', type: '概念', stock: '光迅科技' },
];

// ======================== API 请求 ========================
async function query(question, type, retry = 2) {
    for (let i = 0; i <= retry; i++) {
        const res = await fetch(`${BASE}/api/query`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question, type: type || 'zhishu', perpage: 100, page: 1 }),
        });
        const data = await res.json();
        if ((data.data || []).length > 0) return data;
        if (i < retry) await new Promise(r => setTimeout(r, 2000));
    }
    return { data: [], error: 'empty after retry' };
}

// ======================== 策略函数（与 v6/js/strategy.js 完全一致） ========================

const num = (e) => (e != null ? Number(Number(e).toFixed(3)) : 0);

function handleRate(obj, ele, type, dates) {
    const { nd1, td, pd1, pd2, pd3, pd4 } = dates;
    const t = type === 'block' ? '指数@' : '';

    obj[td] = {
        涨跌幅: num(ele[t + '涨跌幅:前复权[' + td + ']']),
        资金流向: num(ele[t + '资金流向[' + td + ']']),
        大单净额: num(ele[t + 'dde大单净额[' + td + ']']),
    };
    obj[td + ' 09:35'] = {
        涨跌幅: num(ele[t + '分时涨跌幅:前复权[' + td + ' 09:35]']),
        资金流向: num(ele[t + '分时资金流向[' + td + ' 09:35]']),
        大单净额: num(ele[t + '分时dde大单净额[' + td + ' 09:35]']),
    };
    obj[td + ' 09:33'] = {
        涨跌幅: num(ele[t + '分时涨跌幅:前复权[' + td + ' 09:33]']),
        资金流向: num(ele[t + '分时资金流向[' + td + ' 09:33]']),
        大单净额: num(ele[t + '分时dde大单净额[' + td + ' 09:33]']),
    };
    obj[pd1] = {
        涨跌幅: num(ele[t + '涨跌幅:前复权[' + pd1 + ']'] || ele[t + '分时涨跌幅:前复权[' + pd1 + ' 15:00]']),
        资金流向: num(ele[t + '资金流向[' + pd1 + ']'] || ele[t + '分时资金流向[' + pd1 + ' 15:00]']),
        大单净额: num(ele[t + 'dde大单净额[' + pd1 + ']'] || ele[t + '分时dde大单净额[' + pd1 + ' 15:00]']),
    };
    obj[nd1] = { 涨跌幅: num(ele[t + '涨跌幅:前复权[' + nd1 + ']']) };
    obj[pd2] = {
        涨跌幅: num(ele[t + '涨跌幅:前复权[' + pd2 + ']'] || ele[t + '分时涨跌幅:前复权[' + pd2 + ' 15:00]'] || 0),
        大单净额: num(ele[t + 'dde大单净额[' + pd2 + ']'] || ele[t + '分时dde大单净额[' + pd2 + ' 15:00]'] || 0),
    };

    const maPre = type === 'block' ? '日指数@均线' : '日均线';
    obj.M01 = num(ele['1' + maPre + '[' + pd1 + ']']);
    obj.M05 = num(ele['5' + maPre + '[' + pd1 + ']']);
    obj.M10 = num(ele['10' + maPre + '[' + pd1 + ']']);
    obj.M21 = num(ele['21' + maPre + '[' + pd1 + ']']);
    obj.M60 = num(ele['60' + maPre + '[' + pd1 + ']']);
    obj.prevM05 = num(ele['5' + maPre + '[' + pd2 + ']'] || 0);
    obj.prevM10 = num(ele['10' + maPre + '[' + pd2 + ']'] || 0);
    obj.prevM21 = num(ele['21' + maPre + '[' + pd2 + ']'] || 0);
    obj.prevM60 = num(ele['60' + maPre + '[' + pd2 + ']'] || 0);

    const macdSuffix = type === 'block' ? '' : '(macd值)';
    obj.macdDiff = num(ele[t + 'macd(diff值)[' + pd1 + ']']);
    obj.macdDea  = num(ele[t + 'macd(dea值)[' + pd1 + ']']);
    obj.macdMacd = num(ele[t + 'macd' + macdSuffix + '[' + pd1 + ']']);
    obj.prevMacdDiff = num(ele[t + 'macd(diff值)[' + pd2 + ']'] || 0);
    obj.prevMacdDea  = num(ele[t + 'macd(dea值)[' + pd2 + ']'] || 0);
    obj.prevMacdMacd = num(ele[t + 'macd' + macdSuffix + '[' + pd2 + ']'] || 0);

    if (type !== 'block') {
        obj['股票简称'] = ele['股票简称'] || '';
        obj[pd1]['热度排名'] = ele['个股热度排名[' + pd1 + ']'] || ele['个股热度排名[' + td + ']'];
        obj[pd1]['收盘价'] = num(ele['收盘价:不复权[' + pd1 + ']']) || 0;
        const highKey = Object.keys(ele).find(k => k.startsWith('区间最高价:不复权['));
        obj.rangeHigh5 = highKey ? num(ele[highKey]) : 0;
        obj.volDaily1 = num(ele['成交量[' + pd1 + ']']);
        obj.volDaily2 = num(ele['成交量[' + pd2 + ']']);
        obj.volDaily3 = num(ele['成交量[' + pd3 + ']']);
        obj['code'] = ele['code'] || '';
        obj['昨日涨跌幅排名'] = ele['昨日涨跌幅排名'] || 9999;
    } else {
        obj['指数简称'] = ele['指数简称'] || '';
        obj.volPd1 = num(ele[t + '成交量[' + pd1 + ']']);
        obj.volPd2 = num(ele[t + '成交量[' + pd2 + ']']);
        obj.volPd3 = num(ele[t + '成交量[' + pd3 + ']'] || 0);
        obj.limitUpCount = num(ele[t + '涨停家数[' + pd1 + ']'] || 0);
        obj['昨日涨跌幅排名'] = ele['昨日涨跌幅排名'] || 9999;
    }
}

function evaluateStockStrong(item, dates) {
    const { pd1 } = dates;
    const isLimitUp = (item[pd1] && item[pd1]['涨跌幅'] || 0) >= 9.5;
    const trend12ma = item.M01 > item.M05 && item.M01 > item.M10 && item.M01 > item.M21 && item.M01 > item.M60
        && item.M05 > item.M10
        && item.M05 > item.prevM05 && item.M10 > item.prevM10 && item.M21 > item.prevM21;
    const trend12 = trend12ma && (isLimitUp || item.M60 > item.prevM60);
    const trend3 = item.macdDiff > item.macdDea || item.macdMacd > item.prevMacdMacd;
    const trend4 = item.macdMacd > item.prevMacdMacd && item.macdDiff > item.prevMacdDiff && item.macdDea > item.prevMacdDea;
    const fund1 = (item[pd1] && item[pd1]['大单净额'] || 0) > 0;
    const change1 = (item[pd1] && item[pd1]['涨跌幅'] || 0) > 0;
    const fund2 = (item[dates.pd2] && item[dates.pd2]['大单净额'] || 0) > 0 || (fund1 && change1);
    const change2 = (item[dates.td + ' 09:35'] && item[dates.td + ' 09:35']['涨跌幅'] || 0) > 0;
    const pd1Chg = item[pd1] && item[pd1]['涨跌幅'] || 0;
    const c0935Chg = item[dates.td + ' 09:35'] && item[dates.td + ' 09:35']['涨跌幅'] || 0;
    const openQuality = pd1Chg > 0.5 && c0935Chg / pd1Chg > 0.2;
    const breakout = (item[pd1] && item[pd1]['收盘价'] || 0) >= item.rangeHigh5 * 0.95;
    const volDailyBreak = (item.volDaily1 || 0) > (item.volDaily2 || 0) || isLimitUp;
    const macdSeq = item.macdMacd > item.prevMacdMacd;
    const pd2Chg = item[dates.pd2] && item[dates.pd2]['涨跌幅'] || 0;
    const accel = pd1Chg > pd2Chg || c0935Chg > pd1Chg;

    return {
        isStrong: trend12 && trend3 && trend4 && fund1 && fund2 && change1 && change2 && openQuality && breakout && volDailyBreak && macdSeq && accel,
        fail: ['trend12', 'trend3', 'trend4', 'fund1', 'fund2', 'change1', 'change2', 'openQuality', 'breakout', 'volDailyBreak', 'macdSeq', 'accel']
            .filter((_, i) => ![trend12, trend3, trend4, fund1, fund2, change1, change2, openQuality, breakout, volDailyBreak, macdSeq, accel][i]),
    };
}

function evaluateBlockStrong(item, dates) {
    const { pd1 } = dates;
    const trend12 = item.M01 > item.M05 && item.M01 > item.M10 && item.M01 > item.M21 && item.M01 > item.M60
        && item.M05 > item.prevM05;
    const trend3 = item.macdDiff > item.macdDea || item.macdMacd > item.prevMacdMacd;
    const trend4 = item.macdMacd > item.prevMacdMacd && item.macdDiff > item.prevMacdDiff;
    const trendStage = item.M60 > 0 && !(item.M01 / item.M10 > 1.055 && item.M01 / item.M60 > 1.15);
    const fund1 = (item[pd1] && item[pd1]['大单净额'] || 0) > 0;
    const change1 = (item[pd1] && item[pd1]['涨跌幅'] || 0) > 0;
    const change2 = (item[dates.td + ' 09:35'] && item[dates.td + ' 09:35']['涨跌幅'] || 0) > 0.5;
    const volBreak = (item.volPd1 || 0) > (item.volPd2 || 0);
    const f0935 = item[dates.td + ' 09:35'] && item[dates.td + ' 09:35']['资金流向'] || 0;
    const n0935 = item[dates.td + ' 09:35'] && item[dates.td + ' 09:35']['大单净额'] || 0;
    const flowOk = !(f0935 < 0 && n0935 < 0);
    const hasLeader = (item.limitUpCount || 0) > 0;

    const pd1Flow = item[pd1] && item[pd1]['资金流向'] || 0;
    const pd1Net  = item[pd1] && item[pd1]['大单净额'] || 0;
    const pd1Chg  = item[pd1] && item[pd1]['涨跌幅'] || 0;
    const c0935   = item[dates.td + ' 09:35'] && item[dates.td + ' 09:35']['涨跌幅'] || 0;
    const c0933   = item[dates.td + ' 09:33'] && item[dates.td + ' 09:33']['涨跌幅'] || 0;
    const f0933   = item[dates.td + ' 09:33'] && item[dates.td + ' 09:33']['资金流向'] || 0;
    const n0933   = item[dates.td + ' 09:33'] && item[dates.td + ' 09:33']['大单净额'] || 0;
    const pd1AllPositive = pd1Flow > 0 && pd1Net > 0 && pd1Chg > 0;
    const td0935Positive  = f0935 > 0 && n0935 > 0 && c0935 > 0;
    const td0933Positive  = f0933 > 0 && n0933 > 0 && c0933 > 0;
    const tdImproving     = f0935 > f0933 && n0935 > n0933 && c0935 > c0933;
    const superHot = pd1AllPositive && td0935Positive && td0933Positive && tdImproving
        && item.M05 > item.M10 && item.M05 > item.prevM05;

    const rankTop20 = (item['昨日涨跌幅排名'] || 9999) <= 20;
    const pd1ChgGt2 = pd1Chg > 2;
    const rankOrChg = rankTop20 || pd1ChgGt2;

    const normalStrong = trend12 && trend3 && trend4 && trendStage && fund1 && change1 && change2 && volBreak && flowOk && hasLeader;

    return {
        isStrong: (normalStrong || superHot) && rankOrChg && trendStage,
        fail: [
            ...(normalStrong ? [] : ['normalStrong']),
            ...(rankOrChg ? [] : ['rankOrChg']),
        ],
    };
}

// ======================== 查询构造（与 v6/js/strategy.js getQuestions 一致） ========================

function buildBlockQueries(type, d) {
    const { nd1, td, pd1, pd2, pd3 } = d;
    const blockField = type === '行业' ? '二级行业' : '概念';
    const macdBlock = pd1 + '(MACD(DIFF值);MACD(DEA值);MACD);' + pd2 + '(MACD(DIFF值);MACD(DEA值);MACD)';
    const maBlock   = pd1 + '(1日均线和M5和M10和M21和M60);' + pd2 + '(1日均线和M5和M10和M21和M60)';
    return [
        td + '涨跌幅;' + td + ' 09:35涨跌幅降序;' + td + ' 09:35资金流向大单净额;' + td + ' 09:33涨跌幅资金流向大单净额;' + pd2 + '涨跌幅成交量大单净额;' + td + '前3交易日涨跌幅;' + td + '前3交易日资金流向;' + pd1 + '前5交易日区间最高价;' + pd1 + '资金流向大单净额;' + blockField,
        pd1 + '涨跌幅降序;' + pd1 + '成交量;' + pd2 + '成交量;' + pd3 + '成交量;' + pd1 + '涨停家数;' + maBlock + ';' + blockField,
        pd1 + '涨跌幅降序;' + macdBlock + ';' + blockField,
    ];
}

function buildStockQueries(d, blockType, blockName) {
    const { nd1, td, pd1, pd2, pd3 } = d;
    const bf = blockType === '行业' ? '所属行业包含' : '所属概念包含';
    const macdStock = pd1 + '(MACD(DIFF值);MACD(DEA值);MACD);' + pd2 + '(MACD(DIFF值);MACD(DEA值);MACD)';
    return [
        td + ' 09:35涨跌幅降序;' + pd1 + '涨跌幅资金流向大单净额;' + pd1 + '收盘价;' + pd1 + '热度排名;' + pd1 + '前5交易日区间最高价不复权;' + pd1 + '成交量;' + td + ' 09:35涨跌幅资金流向大单净额;' + td + ' 09:33涨跌幅资金流向大单净额;行业概念主板创业非ST;' + bf + blockName,
        pd1 + '涨跌幅降序;' + nd1 + '涨跌幅;' + td + '涨跌幅;' + pd2 + '涨跌幅;' + pd2 + '成交量;' + pd2 + '大单净额;三级行业;' + pd1 + '(1日均线和M5);' + pd2 + '(1日均线和M5);行业概念主板创业非ST;' + bf + blockName,
        pd1 + '涨跌幅降序;' + macdStock + ';' + pd1 + '(M10和M21和M60);' + pd2 + '(M10和M21和M60);行业概念主板创业非ST;' + bf + blockName,
        pd1 + ' 首次涨停时间;' + pd1 + ' 连续涨停天数;行业概念主板创业非ST;' + bf + blockName,
    ];
}

// ======================== 数据获取 ========================

async function fetchBlocks(d, type) {
    const qs = buildBlockQueries(type, d);
    const [r0, r1, r2] = await Promise.all([
        query(qs[0], 'zhishu'), query(qs[1], 'zhishu'), query(qs[2], 'zhishu'),
    ]);
    const m0 = new Map((r0.data || []).map((it, i) => [it.code, { item: it, rank: i + 1 }]));
    const m1 = new Map((r1.data || []).map(it => [it.code, it]));
    const m2 = new Map((r2.data || []).map(it => [it.code, it]));
    const blocks = [];
    m0.forEach((v0, code) => {
        if (!m1.has(code) || !m2.has(code)) return;
        const merged = Object.assign({}, v0.item, m1.get(code), m2.get(code));
        merged['09:35涨跌幅排名'] = v0.rank;
        const obj = {};
        handleRate(obj, merged, 'block', d);
        blocks.push(obj);
    });
    // 按 pd1 涨跌幅排序后分配排名
    blocks.sort((a, b) => (b[d.pd1] && b[d.pd1]['涨跌幅'] || -1e9) - (a[d.pd1] && a[d.pd1]['涨跌幅'] || -1e9));
    blocks.forEach((it, i) => { it['昨日涨跌幅排名'] = i + 1; });
    return blocks;
}

async function fetchStocks(d, blockType, blockName) {
    const qs = buildStockQueries(d, blockType, blockName);
    const [r0, r1, r2] = await Promise.all([
        query(qs[0], 'stock'), query(qs[1], 'stock'), query(qs[2], 'stock'),
    ]);

    if ((r0.data || []).length === 0) {
        console.log('    ⚠ q0 返回空, len=' + qs[0].length + ' error=' + (r0.error || ''));
        return [];
    }

    const sm0 = new Map((r0.data || []).map(it => [it.code, it]));
    const sm1 = new Map((r1.data || []).map(it => [it.code, it]));
    const sm2 = new Map((r2.data || []).map(it => [it.code, it]));

    // 按 pd1 涨跌幅排序分配排名
    const sorted = [...sm0.values()].sort((a, b) =>
        (Number(b['涨跌幅:前复权[' + d.pd1 + ']']) || -Infinity) - (Number(a['涨跌幅:前复权[' + d.pd1 + ']']) || -Infinity)
    );

    const stocks = [];
    sm0.forEach((item0, code) => {
        let merged = Object.assign({}, item0);
        if (sm1.has(code)) Object.assign(merged, sm1.get(code));
        if (sm2.has(code)) Object.assign(merged, sm2.get(code));

        const idx = sorted.findIndex(it => it.code === code);
        merged['昨日涨跌幅排名'] = idx >= 0 ? idx + 1 : 9999;

        const obj = {};
        handleRate(obj, merged, 'stock', d);
        stocks.push(obj);
    });
    return stocks;
}

// ======================== 执行测试 ========================

async function run() {
    const results = [];
    let pass = 0, fail = 0;

    for (let i = 0; i < CASES.length; i++) {
        const c = CASES[i];
        const d = { td: c.td, pd1: c.pd1, pd2: c.pd2, pd3: c.pd3, pd4: '', nd1: c.nd1 };
        const label = `${c.td.slice(4,6)}-${c.td.slice(6,8)} ${c.block}(${c.type}) → ${c.stock}`;

        // --- Block ---
        const blocks = await fetchBlocks(d, c.type);
        const blockItem = blocks.find(b => b['指数简称'] === c.block);
        const blockR = blockItem ? evaluateBlockStrong(blockItem, d) : null;
        const blockOk = blockR ? blockR.isStrong : false;
        const blockFail = blockR ? blockR.fail.join(',') : 'NOT_FOUND';

        // --- Stock ---
        const stocks = await fetchStocks(d, c.type, c.block);
        const stockItem = stocks.find(s => s['股票简称'] === c.stock);
        const stockR = stockItem ? evaluateStockStrong(stockItem, d) : null;
        const stockOk = stockR ? stockR.isStrong : false;
        const stockFail = stockR ? stockR.fail.join(',') : 'NOT_FOUND';
        if (!stockItem) {
            // 诊断：检查是否在原始数据中
            const sampleNames = stocks.slice(0, 3).map(s => s['股票简称']).join(',');
            const partial = stocks.filter(s => (s['股票简称'] || '').includes(c.stock.slice(0, 1)));
            if (stocks.length === 0) console.log(`    ⚠ Stock 查询返回空 (查询超200字符?)`);
            else console.log(`    ⚠ 未找到「${c.stock}」, 共${stocks.length}只, 样本: ${sampleNames}${partial.length ? ', 含关键字: '+partial.map(s=>s['股票简称']).join(',') : ''}`);
        }

        const bIcon = blockItem ? (blockOk ? '✅' : '❌') : '🔍';
        const sIcon = stockItem ? (stockOk ? '✅' : '❌') : '🔍';
        const info = [];
        if (!blockOk && blockItem) info.push('B:' + blockFail);
        if (!stockOk && stockItem) info.push('S:' + stockFail);

        if (blockOk && stockOk) pass++;
        else fail++;

        console.log(`${bIcon} ${sIcon}  ${label}  ${info.join('  ')}`);
    }

    console.log(`\n${'─'.repeat(50)}`);
    console.log(`通过: ${pass}/${CASES.length}  失败: ${fail}/${CASES.length}`);
}

run().catch(e => { console.error(e); process.exit(1); });

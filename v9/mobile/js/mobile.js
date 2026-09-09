/**
 * V6 手机版
 * 复用 desktop 版的 strategy/数据模块，简化 UI 为移动列表
 */
const { createApp, onMounted, reactive, computed } = Vue;

let _useProxy = false;

function formatNumber(val, type) {
    if (val == null || isNaN(val)) return '-';
    const n = Number(val);
    if (type === 'shizhi') { if (Math.abs(n) >= 1e8) return (n / 1e8).toFixed(2) + '亿'; return (n / 1e4).toFixed(2) + '万'; }
    if (Math.abs(n) >= 1e8) return (n / 1e8).toFixed(2) + '亿';
    if (Math.abs(n) >= 1e4) return (n / 1e4).toFixed(0) + '万';
    return n.toFixed(0);
}
function precentformater(val) {
    if (val == null || isNaN(val)) return '-';
    const n = Number(val).toFixed(2);
    const cls = n > 0 ? 'red' : n < 0 ? 'green' : '';
    return `<span class="${cls}">${n > 0 ? '+' : ''}${n}%</span>`;
}

/* ================================================================
 * 请求工具 (复用 desktop 版)
 * ================================================================ */
function debugLog(...args) {}

async function fetchWithRetry(requestType, question, options = {}) {
    const { maxRetries = 2, retryDelay = 1000, signal } = options;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        if (attempt > 0) await new Promise(r => setTimeout(r, retryDelay));
        try {
            const reqConfig = hexin_vJsRequests(requestType, question);
            let res;
            if (_useProxy) {
                res = await proxyRequest(reqConfig, 20000);
            } else {
                res = await axios(reqConfig, signal ? { signal } : {});
            }
            const data = res?.data?.data?.answer?.[0]?.txt?.[0]?.content?.components?.[0]?.data?.datas;
            if (Array.isArray(data) && data.length > 0 ? data[0]['code'] : true) return data;
            throw new Error('Invalid data');
        } catch (e) {
            if (e.name === 'AbortError' || e.code === 'ERR_CANCELED') throw e;
            if (attempt >= maxRetries) throw e;
        }
    }
}

/* ================================================================
 * 数据模块工厂 (复用 desktop 版)
 * ================================================================ */
function createDataModule(config) {
    const { name, cacheKey, requestType, dataHandler } = config;
    const module = reactive({
        loading: false, isFromCache: false,
        Data: [{ name, filters: [] }], requestStatus: [],
        _abortController: null,
        init: async (dates, cacheSubKey, questionsBuilder) => {
            if (module._abortController) module._abortController.abort();
            module._abortController = new AbortController();
            module.isFromCache = false;
            await module.getData(dates, cacheSubKey, questionsBuilder, {});
        },
        getData: async (dates, cacheSubKey, questionsBuilder, cache) => {
            const questions = questionsBuilder(dates);
            module.loading = true; module.Data[0].filters = [];
            module.requestStatus = questions.map((_, i) => ({ name: `R${i+1}`, status: 'wait', message: '' }));
            const results = [];
            for (let i = 0; i < questions.length; i++) {
                if (module._abortController?.signal.aborted) { module.loading = false; return; }
                module.requestStatus[i] = { name: `R${i+1}`, status: 'process', message: '' };
                try {
                    results[i] = await fetchWithRetry(requestType, questions[i], {
                        maxRetries: 2, retryDelay: 1000, signal: module._abortController?.signal,
                    });
                    module.requestStatus[i].status = 'success';
                    module.requestStatus[i].message = `${results[i].length}`;
                } catch (e) {
                    if (e.name === 'AbortError' || e.code === 'ERR_CANCELED') { module.loading = false; return; }
                    module.requestStatus[i].status = 'error'; module.loading = false; return;
                }
            }
            if (results.filter(Boolean).length === questions.length) {
                dataHandler(results, dates);
            }
            module.loading = false;
        },
        abort: () => { if (module._abortController) module._abortController.abort(); },
    });
    return module;
}

/* ================================================================
 * App
 * ================================================================ */
const App = {
    setup() {
        const changeDate = (dir) => {
            const list = Dates.historicalDate || [];
            const current = dayjs(Dates.requestDate).format('YYYYMMDD');
            const idx = list.indexOf(current);
            if (idx !== -1 && idx + dir >= 0 && idx + dir < list.length) {
                Dates.requestDate = dayjs(list[idx + dir]).format('YYYY-MM-DD');
                Submit();
            }
        };

        const Dates = reactive({
            requestDate: dayjs().format('YYYY-MM-DD'),
            shareDate: {},
            historicalDate: [],
            setRequestDate(d) {
                const td = dayjs(d).format('YYYYMMDD');
                const list = this.historicalDate;
                const idx = list.indexOf(td);
                const getSafe = (o) => (idx !== -1 && idx + o >= 0 ? list[idx + o] : null);
                this.shareDate = {
                    isToday: dayjs().format('YYYYMMDD') === td,
                    td, tdcn: dayjs(d).format('YYYY年MM月DD日'),
                    pd1: getSafe(-1), pd1cn: dayjs(getSafe(-1)).format('YYYY年MM月DD日'),
                    pd2: getSafe(-2), pd3: getSafe(-3), pd4: getSafe(-4),
                    nd1: getSafe(1), nd2: getSafe(2), nd3: getSafe(3), nd4: getSafe(4), nd5: getSafe(5),
                };
            },
        });

        const GlobalState = reactive({ isRequesting: false, isDarkTheme: true });

        const MatchChart = reactive({
            industryFilterMode: 'all', conceptFilterMode: 'all', stockFilterMode: 'strong',
            selectedStock: null,
        });

        /* ---- 行业 ---- */
        const Industries = createDataModule({
            name: '行业', cacheKey: 'M_Industries', requestType: 'zhishu',
            dataHandler: (results, dates) => {
                const m0 = new Map((results[0] || []).map((item, i) => [item.code, { item, rank: i + 1 }]));
                const m1 = new Map((results[1] || []).map((item, i) => [item.code, { item, rank: i + 1 }]));
                const arr = [];
                m0.forEach((v0, code) => {
                    if (!m1.has(code)) return;
                    const merged = { ...v0.item, ...m1.get(code).item };
                    const obj = {};
                    handleRate(obj, merged, 'block', Dates.shareDate);
                    arr.push(obj);
                });
                Industries.Data[0].filters = arr;
            },
        });

        function buildIndustryQuestions(dates) { return getQuestions('block-行业', dates); }

        /* ---- 概念 ---- */
        const Concepts = createDataModule({
            name: '概念', cacheKey: 'M_Concepts', requestType: 'zhishu',
            dataHandler: (results, dates) => {
                const m0 = new Map((results[0] || []).map((item, i) => [item.code, { item, rank: i + 1 }]));
                const m1 = new Map((results[1] || []).map((item, i) => [item.code, { item, rank: i + 1 }]));
                const arr = [];
                m0.forEach((v0, code) => {
                    if (!m1.has(code)) return;
                    const merged = { ...v0.item, ...m1.get(code).item };
                    const obj = {};
                    handleRate(obj, merged, 'block', Dates.shareDate);
                    arr.push(obj);
                });
                Concepts.Data[0].filters = arr;
            },
        });

        function buildConceptQuestions(dates) { return getQuestions('block-概念', dates); }

        /* ---- Stock ---- */
        const Stocks = createDataModule({
            name: 'Stock', cacheKey: 'M_Stocks', requestType: 'stock',
            dataHandler: (results, dates) => {
                const { td, pd1 } = dates;
                const m0 = new Map((results[0] || []).map(item => [item['code'], item]));
                const m1 = new Map((results[1] || []).map(item => [item['code'], item]));
                const result = [];
                m0.forEach((item0, code) => {
                    if (!m1.has(code)) return;
                    const merged = { ...item0, ...m1.get(code) };
                    const obj = {};
                    handleRate(obj, merged, 'stock', dates);
                    result.push(obj);
                });
                Stocks.Data[0].filters = result;
            },
        });
        Stocks.selectedBlockName = null;
        Stocks.currentBlockType = null;
        Stocks.fetchByBlock = async (blockName, blockType, dates) => {
            const cacheSubKey = `${dates.tdcn}_${blockType}_${blockName}`;
            Stocks.selectedBlockName = blockName;
            Stocks.currentBlockType = blockType;
            await Stocks.init(dates, cacheSubKey, (d) => getQuestions('stock', d, blockType, blockName));
        };

        /* ---- 显示过滤 ---- */
        const displayIndustries = computed(() => {
            let r = Industries.Data[0].filters;
            if (MatchChart.industryFilterMode === 'strong') r = r.filter(item => evaluateBlockStrong(item, Dates.shareDate).isStrong);
            r.sort((a, b) => (b[Dates.shareDate.td + ' 09:35']?.涨跌幅 ?? -1e9) - (a[Dates.shareDate.td + ' 09:35']?.涨跌幅 ?? -1e9));
            return r;
        });
        const displayConcepts = computed(() => {
            let r = Concepts.Data[0].filters;
            if (MatchChart.conceptFilterMode === 'strong') r = r.filter(item => evaluateBlockStrong(item, Dates.shareDate).isStrong);
            r.sort((a, b) => (b[Dates.shareDate.td + ' 09:35']?.涨跌幅 ?? -1e9) - (a[Dates.shareDate.td + ' 09:35']?.涨跌幅 ?? -1e9));
            return r;
        });
        const displayStocks = computed(() => {
            if (!Stocks.selectedBlockName) return [];
            let r = Stocks.Data[0].filters;
            if (MatchChart.stockFilterMode === 'strong') {
                r = r.filter(s => evaluateStockStrong(s, Dates.shareDate).isStrong);
            }
            r.sort((a, b) => (a[Dates.shareDate.pd1]?.热度排名 ?? 1e9) - (b[Dates.shareDate.pd1]?.热度排名 ?? 1e9));
            return r.map(s => ({ ...s }));
        });

        /* ---- 操作 ---- */
        const Submit = async () => {
            GlobalState.isRequesting = true;
            Industries.abort(); Concepts.abort();
            Industries.loading = true; Concepts.loading = true;
            Industries.Data[0].filters = []; Concepts.Data[0].filters = [];
            Stocks.selectedBlockName = null; Stocks.Data[0].filters = [];
            Dates.setRequestDate(Dates.requestDate);
            try {
                await Promise.all([
                    Industries.init(Dates.shareDate, null, buildIndustryQuestions),
                    Concepts.init(Dates.shareDate, null, buildConceptQuestions),
                ]);
            } finally { GlobalState.isRequesting = false; Industries.loading = false; Concepts.loading = false; }
        };

        const handleIndustryRowClick = async (row) => {
            await Stocks.fetchByBlock(row['指数简称'], '行业', Dates.shareDate);
        };
        const handleConceptRowClick = async (row) => {
            await Stocks.fetchByBlock(row['指数简称'], '概念', Dates.shareDate);
        };

        /* ---- 时间 ---- */
        const Intervals = reactive({ time: '' });
        onMounted(async () => {
            _useProxy = await initProxyMode();
            // 获取历史日期
            try {
                const cfg = hexin_vJsRequests('zhishu', '上证指数');
                const r = _useProxy ? await proxyRequest(cfg) : await axios(cfg);
                const datas = r?.data?.data?.answer?.[0]?.txt?.[0]?.content?.components?.[0]?.data?.datas;
                if (datas?.length) {
                    const d = datas.find(d => d.code === '000001.SH' || d['指数代码']?.startsWith('000001'));
                    if (d) {
                        const times = Object.keys(d).filter(k => k.match(/^\d{8}$/));
                        Dates.historicalDate = times.sort();
                    }
                }
            } catch (e) { console.log('Date init fallback'); }
            // 时钟
            const tick = () => {
                const now = new Date();
                Intervals.time = now.toLocaleTimeString('zh-CN', { hour12: false });
            };
            tick();
            setInterval(tick, 1000);
        });

        return {
            Dates, GlobalState, MatchChart,
            Industries, Concepts, Stocks,
            displayIndustries, displayConcepts, displayStocks,
            Submit, changeDate, handleIndustryRowClick, handleConceptRowClick,
            Intervals,
        };
    },
};

const app = createApp(App);
app.use(ElementPlus, { locale: ElementPlusLocaleZhCn });
app.mount('#app');

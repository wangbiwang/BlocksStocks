/**
 * V8 当日预筛页面逻辑
 * - 数据查询：Preselect.getYesterdayQuestions（仅 pd1 及更早数据，不含 td 09:35）
 * - 评估：Preselect.evaluateBlockYesterday / evaluateStockYesterday（昨日条件）
 * - 查询完成后自动把全量昨日数据保存到 data/preset/{td}.json
 */
const { createApp, onMounted, reactive, computed } = Vue

const DEBUG = false
function debugLog(...args) { if (DEBUG) console.log(...args) }

let _useProxy = false

async function fetchWithRetry(requestParams, question, options = {}) {
    const { maxRetries = 2, retryDelay = 1000, signal } = options
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (signal?.aborted) throw new DOMException('Request aborted', 'AbortError')
        try {
            if (attempt > 0) await new Promise((r) => setTimeout(r, retryDelay))
            let res
            const reqConfig = hexin_vJsRequests(requestParams, question)
            if (_useProxy) {
                res = await proxyRequest(reqConfig, 20000)
            } else {
                res = await axios(reqConfig, signal ? { signal } : {})
            }
            const data = res?.data?.data?.answer?.[0]?.txt?.[0]?.content?.components?.[0]?.data?.datas
            if (Array.isArray(data) && data.length > 0 ? data[0]['code'] : true) return data
            throw new Error('Invalid data')
        } catch (e) {
            if (e.name === 'AbortError' || e.code === 'ERR_CANCELED') throw e
            if (attempt >= maxRetries) throw e
        }
    }
}

function createDataModule(config) {
    const { name, cacheKey, requestType, dataHandler } = config
    const module = reactive({
        loading: false,
        isFromCache: false,
        Data: [{ name, filters: [] }],
        requestStatus: [],
        _abortController: null,
        init: async (dates, cacheSubKey, questionsBuilder) => {
            if (module._abortController) module._abortController.abort()
            module._abortController = new AbortController()
            module.isFromCache = false
            await module.getData(dates, cacheSubKey, questionsBuilder, {})
        },
        getData: async (dates, cacheSubKey, questionsBuilder, cache) => {
            const questions = questionsBuilder(dates)
            module.loading = true
            module.isFromCache = false
            module.Data[0].filters = []
            module.requestStatus = questions.map((_, i) => ({ name: `Request ${i + 1}`, status: 'wait', message: 'Not started' }))
            const results = []
            for (let i = 0; i < questions.length; i++) {
                if (module._abortController?.signal.aborted) { module.loading = false; return }
                module.requestStatus[i] = { name: `Request ${i + 1}`, status: 'process', message: 'Loading...' }
                try {
                    results[i] = await fetchWithRetry(requestType, questions[i], {
                        maxRetries: 2, retryDelay: 1000, signal: module._abortController?.signal,
                    })
                    module.requestStatus[i].status = 'success'
                    module.requestStatus[i].message = `Success (${results[i].length})`
                } catch (e) {
                    if (e.name === 'AbortError' || e.code === 'ERR_CANCELED') { module.loading = false; return }
                    module.requestStatus[i].status = 'error'
                    module.requestStatus[i].message = 'Failed to fetch'
                    module.loading = false
                    return
                }
            }
            const successResults = results.filter(Boolean)
            if (successResults.length === questions.length) {
                try { dataHandler(successResults, dates) } catch (err) { console.error(`[${name}] Data processing error:`, err) }
            }
            module.loading = false
        },
        abort: () => {
            if (module._abortController) { module._abortController.abort(); module._abortController = null }
        },
    })
    return module
}

const Dates = reactive({
    requestDate: null,
    Today: dayjs().format('YYYYMMDD'),
    historicalDate: [],
    shareDate: {},
    init: async (catcheGetFunction, catcheSetFunction) => {
        const FD = (await catcheGetFunction('Dates')) || { historicalDate: [] }
        try {
            const size = FD.historicalDate?.length > 0 ? 320 : (Number(dayjs().format('YYYY')) - 2021 + 1) * 270
            const url = `https://proxy.finance.qq.com/ifzqgtimg/appstock/app/newfqkline/get?_var=kline_dayqfq&param=sh000001,day,,,${size},qfq`
            const { status, data } = await axios.get(url)
            if (status === 200 && data) {
                const parsed = JSON.parse(String(data).replace('kline_dayqfq=', ''))
                const shData = parsed?.data?.sh000001
                if (shData?.day) {
                    const fetchedArr = shData.day.map((e) => dayjs(e[0]).format('YYYYMMDD'))
                    const mt = shData.qt?.market?.[0]?.split('|') || []
                    if (mt[2]?.includes('open')) fetchedArr.push(dayjs().format('YYYYMMDD'))
                    FD.historicalDate = [...new Set([...(FD.historicalDate || []), ...fetchedArr])].sort((a, b) => a - b)
                    await catcheSetFunction('Dates', FD)
                }
            }
        } catch (err) { console.error('Dates.init Error', err) }
        Dates.historicalDate = FD.historicalDate || []
        Dates.requestDate = Dates.requestDate || Dates.Today
    },
    disabledDate: (time) => {
        const d = dayjs(time)
        const fmt = d.format('YYYYMMDD')
        if (d.isBefore('2021-01-01') || d.isAfter(dayjs()) || d.day() === 0 || d.day() === 6) return true
        return !Dates.historicalDate.includes(fmt)
    },
    setRequestDate: (date) => { Dates.requestDate = dayjs(date || Dates.Today).format('YYYYMMDD') },
    setShareDate: () => {
        const list = Dates.historicalDate || []
        const td = Dates.requestDate
        const idx = list.indexOf(td)
        const getSafe = (offset) => (idx !== -1 && idx + offset >= 0 ? list[idx + offset] : null)
        const isToday = dayjs(new Date()).format('YYYYMMDD') == td
        Dates.shareDate = {
            isToday, td,
            tdcn: dayjs(td).format('YYYY年MM月DD日'),
            pd1: getSafe(-1),
            pd1cn: getSafe(-1) ? dayjs(getSafe(-1)).format('YYYY年MM月DD日') : '-',
            pd2: getSafe(-2),
            pd3: getSafe(-3),
            pd4: getSafe(-4),
            nd1: getSafe(1),
        }
    },
})

const Industries = createDataModule({
    name: '行业预筛',
    cacheKey: 'Industries',
    requestType: 'zhishu',
    dataHandler: (results, dates) => {
        const m0 = new Map((results[0] || []).map((item, i) => [item['code'], { item, rank: i + 1 }]))
        const m1 = new Map((results[1] || []).map(item => [item['code'], item]))
        const m2 = new Map((results[2] || []).map(item => [item['code'], item]))
        const mergedArr = []
        m0.forEach((v0, code) => {
            if (m1.has(code) && m2.has(code)) {
                const merged = { ...v0.item, ...m1.get(code), ...m2.get(code) }
                merged['昨日涨跌幅排名'] = v0.rank          // r0 按 pd1 涨跌幅降序 → 位置即排名
                const obj = {}
                handleRate(obj, merged, 'block', Dates.shareDate)
                const r = Preselect.evaluateBlockYesterday(obj, Dates.shareDate)
                obj.__isCandidate = r.isYesterday || r.isSuperHotBase
                obj.__conditions = r.conditions
                mergedArr.push(obj)
            }
        })
        mergedArr.sort((a, b) => (b[Dates.shareDate.pd1]?.涨跌幅 ?? -1e9) - (a[Dates.shareDate.pd1]?.涨跌幅 ?? -1e9))
        Industries.Data[0].filters = mergedArr
    },
})

const Concepts = createDataModule({
    name: '概念预筛',
    cacheKey: 'Concepts',
    requestType: 'zhishu',
    dataHandler: (results, dates) => {
        const m0 = new Map((results[0] || []).map((item, i) => [item['code'], { item, rank: i + 1 }]))
        const m1 = new Map((results[1] || []).map(item => [item['code'], item]))
        const m2 = new Map((results[2] || []).map(item => [item['code'], item]))
        const mergedArr = []
        m0.forEach((v0, code) => {
            if (m1.has(code) && m2.has(code)) {
                const merged = { ...v0.item, ...m1.get(code), ...m2.get(code) }
                merged['昨日涨跌幅排名'] = v0.rank
                const obj = {}
                handleRate(obj, merged, 'block', Dates.shareDate)
                const r = Preselect.evaluateBlockYesterday(obj, Dates.shareDate)
                obj.__isCandidate = r.isYesterday || r.isSuperHotBase
                obj.__conditions = r.conditions
                mergedArr.push(obj)
            }
        })
        mergedArr.sort((a, b) => (b[Dates.shareDate.pd1]?.涨跌幅 ?? -1e9) - (a[Dates.shareDate.pd1]?.涨跌幅 ?? -1e9))
        Concepts.Data[0].filters = mergedArr
    },
})

const Stocks = createDataModule({
    name: 'Stock 预筛',
    cacheKey: 'Stocks',
    requestType: 'stock',
    dataHandler: (results, dates) => {
        const m0 = new Map((results[0] || []).map((item, i) => [item['code'], { item, rank: i + 1 }]))
        const m1 = new Map((results[1] || []).map((item, i) => [item['code'], { item, rank: i + 1 }]))
        const m2 = new Map((results[2] || []).map(item => [item['code'], item]))
        const m3 = new Map((results[3] || []).map(item => [item['code'], item]))
        const result = []
        m0.forEach((v0, code) => {
            let merged = { ...v0.item }
            merged['昨日涨跌幅排名'] = m1.has(code) ? m1.get(code).rank : 9999
            if (m1.has(code)) Object.assign(merged, m1.get(code).item)
            if (m2.has(code)) Object.assign(merged, m2.get(code))
            if (m3.has(code)) Object.assign(merged, m3.get(code))
            const obj = {}
            handleRate(obj, merged, 'stock', Dates.shareDate)
            const r = Preselect.evaluateStockYesterday(obj, Dates.shareDate)
            obj.__isCandidate = r.isYesterday
            obj.__conditions = r.conditions
            obj.__blockType = Stocks.currentBlockType
            obj.__blockName = Stocks.selectedBlockName
            result.push(obj)
        })
        Stocks.Data[0].filters = result
    },
})

Stocks.selectedBlockName = null
Stocks.currentBlockType = null

Stocks.fetchByBlock = async (blockName, blockType, dates) => {
    const { tdcn } = dates
    const cacheSubKey = `${tdcn}_${blockType}_${blockName}`
    Stocks.selectedBlockName = blockName
    Stocks.currentBlockType = blockType
    await Stocks.init(dates, cacheSubKey, (d) => Preselect.getYesterdayQuestions('stock', d, blockType, blockName))
}

function buildIndustryQuestions(dates) { return Preselect.getYesterdayQuestions('block-行业', dates) }
function buildConceptQuestions(dates) { return Preselect.getYesterdayQuestions('block-概念', dates) }

const MatchChart = reactive({
    industryFilterMode: 'strong',
    conceptFilterMode: 'strong',
    stockFilterMode: 'strong',
})

const App = {
    setup() {
        const Intervals = reactive({ timer: null, time: '-', updateTime: () => (Intervals.time = dayjs().format('YYYY-MM-DD HH:mm:ss')) })

        const GlobalState = reactive({
            isRequesting: false,
            isDarkTheme: true,
            presetMode: null,
            toggleTheme: () => {
                GlobalState.isDarkTheme = !GlobalState.isDarkTheme
                document.body.classList.toggle('dark-theme', GlobalState.isDarkTheme)
                document.body.classList.toggle('light-theme', !GlobalState.isDarkTheme)
            },
        })

        onMounted(() => {
            if (GlobalState.isDarkTheme) { document.body.classList.add('dark-theme') } else { document.body.classList.add('light-theme') }
        })

        /* ============ 缓存保存 ============ */
        const buildEntry = (obj, type) => ({
            __type: type,
            __code: obj['code'] || obj['指数简称'] || '',
            __name: obj['股票简称'] || obj['指数简称'] || '',
            __isCandidate: !!obj.__isCandidate,
            __conditions: obj.__conditions || null,
            __blockType: obj.__blockType || (type === 'stock' ? null : type),
            __blockName: obj.__blockName || null,
            obj,
        })

        const savePreset = async () => {
            const { td, pd1 } = Dates.shareDate
            try {
                const payload = {
                    schema: 1,
                    targetDate: td,
                    sourceDate: pd1,
                    createdAt: new Date().toISOString(),
                    blocks: [
                        ...Industries.Data[0].filters.map(b => buildEntry(b, '行业')),
                        ...Concepts.Data[0].filters.map(b => buildEntry(b, '概念')),
                    ],
                    stocks: Stocks.Data[0].filters.map(b => buildEntry(b, 'stock')),
                    meta: {
                        blocksTotal: Industries.Data[0].filters.length + Concepts.Data[0].filters.length,
                        blocksCandidates: Industries.Data[0].filters.filter(b => b.__isCandidate).length + Concepts.Data[0].filters.filter(b => b.__isCandidate).length,
                        stocksTotal: Stocks.Data[0].filters.length,
                        stocksCandidates: Stocks.Data[0].filters.filter(b => b.__isCandidate).length,
                    },
                }
                await fetch('/api/preset', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                })
                GlobalState.presetMode = payload.meta
                ElementPlus.ElMessage.success(`已保存预筛缓存 ${td}.json（板块${payload.blocks.length} 候选${payload.meta.blocksCandidates} 个股${payload.meta.stocksTotal}）`)
            } catch (e) { console.error('保存预筛缓存失败:', e) }
        }

        /* ============ 核心操作 ============ */
        const Submit = async () => {
            GlobalState.isRequesting = true
            Industries.loading = true
            Industries.Data[0].filters = []
            Industries.requestStatus = []
            Concepts.requestStatus = []
            Stocks.Data[0].filters = []
            Dates.setRequestDate(Dates.requestDate)
            Dates.setShareDate()
            try {
                await Promise.all([
                    Industries.init(Dates.shareDate, null, buildIndustryQuestions),
                    Concepts.init(Dates.shareDate, null, buildConceptQuestions),
                ])
                await savePreset()
            } finally {
                GlobalState.isRequesting = false
                Industries.loading = false
                Concepts.loading = false
            }
        }

        /* ============ 计算属性 ============ */
        const strongIndustriesCount = computed(() => Industries.Data[0].filters.filter(item => item.__isCandidate).length)
        const displayIndustries = computed(() => {
            let result = Industries.Data[0].filters
            if (MatchChart.industryFilterMode === 'strong') result = result.filter(item => item.__isCandidate)
            result.sort((a, b) => (b[Dates.shareDate.pd1]?.涨跌幅 ?? -Infinity) - (a[Dates.shareDate.pd1]?.涨跌幅 ?? -Infinity))
            return result
        })
        const strongConceptsCount = computed(() => Concepts.Data[0].filters.filter(item => item.__isCandidate).length)
        const displayConcepts = computed(() => {
            let result = Concepts.Data[0].filters
            if (MatchChart.conceptFilterMode === 'strong') result = result.filter(item => item.__isCandidate)
            result.sort((a, b) => (b[Dates.shareDate.pd1]?.涨跌幅 ?? -Infinity) - (a[Dates.shareDate.pd1]?.涨跌幅 ?? -Infinity))
            return result
        })
        const strongStocksCount = computed(() => {
            if (!Stocks.selectedBlockName) return 0
            return Stocks.Data[0].filters.filter(stock => stock.__isCandidate).length
        })
        const displayStocks = computed(() => {
            if (!Stocks.selectedBlockName) return []
            let result = Stocks.Data[0].filters
            if (MatchChart.stockFilterMode === 'strong') result = result.filter(stock => stock.__isCandidate)
            result.sort((a, b) => {
                if (a['昨日涨停'] !== b['昨日涨停']) return a['昨日涨停'] ? -1 : 1
                const aHeat = a[Dates.shareDate.pd1]?.热度排名 ?? Infinity
                const bHeat = b[Dates.shareDate.pd1]?.热度排名 ?? Infinity
                return aHeat - bHeat
            })
            return result.map((s) => ({ ...s }))
        })

        const toggleIndustryFilterMode = (mode) => { MatchChart.industryFilterMode = mode }
        const toggleConceptFilterMode = (mode) => { MatchChart.conceptFilterMode = mode }
        const toggleStockFilterMode = (mode) => { MatchChart.stockFilterMode = mode }

        const handleIndustryRowClick = async (row) => {
            MatchChart.selectedStock = null
            const blockName = row['指数简称']
            await Stocks.fetchByBlock(blockName, '行业', Dates.shareDate)
            await savePreset()
        }
        const handleConceptRowClick = async (row) => {
            MatchChart.selectedStock = null
            const blockName = row['指数简称']
            await Stocks.fetchByBlock(blockName, '概念', Dates.shareDate)
            await savePreset()
        }
        const handleStockRowClick = (row) => {
            MatchChart.selectedStock = { name: row['股票简称'] }
        }

        const industryRowClassName = () => ''
        const conceptRowClassName = () => ''
        const stockRowClassName = ({ row }) => MatchChart.selectedStock?.name === row['股票简称'] ? 'row-highlight' : ''

        const clearIndustriesCache = async () => {
            if (typeof forceNoCache === 'function') forceNoCache()
            Industries.loading = true
            Industries.Data[0].filters = []
            await Industries.init(Dates.shareDate, null, buildIndustryQuestions)
            await savePreset()
            if (typeof setNoCache === 'function') setNoCache(false)
        }
        const clearConceptsCache = async () => {
            if (typeof forceNoCache === 'function') forceNoCache()
            Concepts.loading = true
            Concepts.Data[0].filters = []
            await Concepts.init(Dates.shareDate, null, buildConceptQuestions)
            await savePreset()
            if (typeof setNoCache === 'function') setNoCache(false)
        }
        const clearStocksCache = async () => {
            if (typeof forceNoCache === 'function') forceNoCache()
            const blockName = Stocks.selectedBlockName
            const blockType = Stocks.currentBlockType
            Stocks.Data[0].filters = []
            if (blockName && blockType) {
                await Stocks.fetchByBlock(blockName, blockType, Dates.shareDate)
            }
            await savePreset()
            if (typeof setNoCache === 'function') setNoCache(false)
        }

        onMounted(async () => {
            Intervals.timer = setInterval(Intervals.updateTime, 1000)
            _useProxy = await initProxyMode()
            await Dates.init(getLocalforage, setLocalforage)
            Dates.setShareDate()
        })

        return {
            Intervals, Dates, Industries, Concepts, Stocks, MatchChart, GlobalState,
            Submit, precentformater, formatNumber,
            displayIndustries, displayConcepts, displayStocks,
            strongIndustriesCount, strongConceptsCount, strongStocksCount,
            toggleIndustryFilterMode, toggleConceptFilterMode, toggleStockFilterMode,
            handleIndustryRowClick, handleConceptRowClick, handleStockRowClick,
            industryRowClassName, conceptRowClassName, stockRowClassName,
            clearIndustriesCache, clearConceptsCache, clearStocksCache,
        }
    },
}

const app = Vue.createApp(App)
app.use(ElementPlus, { locale: ElementPlusLocaleZhCn })
app.mount('#app')

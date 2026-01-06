// 确保 myIndexedDB 在使用之前已经被初始化
const myIndexedDB = localforage.createInstance({
    name: 'myIndexedDB',
})
async function setLocalforage(key, value) {
    try {
        await myIndexedDB.setItem(key, value)  //暂时关闭
        // console.log(`${key} has been set to IndexedDB`)
    } catch (err) {
        console.error(`Error setting ${key} to IndexedDB:`, err)
    }
}
async function getLocalforage(key) {
    try {
        const value = await myIndexedDB.getItem(key)
        if (value == null) return false
        return value
    } catch (err) {
        console.error(`Error getting ${key} from IndexedDB:`, err)
        return false
    }
}

/* 百分比格式化 */
function precentformater(num, decimals = 2) {
    if (num === '-' || num === '' || num === null || num === undefined) return '-'
    let s = (num * 1).toFixed(decimals) + '%'
    return s
}
/* 数字格式化 */
function formatNumber(num, type) {
    if (num === '-' || num === '' || num === null || num === undefined) return '-'

    const n = Number(num)
    if (!Number.isFinite(n)) return '-'

    const isNegative = n < 0 // 标记是否为负数
    const abs = Math.abs(n) // 转换为正数以方便处理

    // gujia: 价格类，保持两位小数且不带单位
    if (type == 'gujia') {
        return (isNegative ? '-' : '') + abs.toFixed(2)
    }

    let s = ''
    if (abs < 10) {
        s = abs.toFixed(2)
    } else if (abs < 10000) {
        s = abs.toString() // 直接转换为字符串
    } else if (abs < 10 ** 7) {
        s = (abs / 10000).toFixed(0) + 'W' // 数字在一万到一千万之间
    } else if (abs < 10 ** 8) {
        s = (abs / 10 ** 8).toFixed(2) + 'H' // 数字在一千万到1亿之间
    } else if (abs < 10 ** 10) {
        s = (abs / 10 ** 8).toFixed(1) + 'H' // 数字在1亿到100亿之间
    } else {
        s = (abs / 10 ** 8).toFixed(0) + 'H' // 数字在100亿以上
    }

    // shizhi: 仍返回带单位的文本（不再返回 HTML，颜色交给外层 .metric-value.red/green 控制）
    if (type == 'shizhi') {
        return (isNegative ? '-' : '') + s
    }

    return (isNegative ? '-' : '') + s
}
/* 移动端判断 */
function isMobile() {
    return /phone|pad|pod|iPhone|iPod|ios|iPad|Android|Mobile|BlackBerry|IEMobile|MQQBrowser|JUC|Fennec|wOSBrowser|BrowserNG|WebOS|Symbian|Windows Phone/i.test(
        navigator.userAgent
    )
}
/* 找出重复出现的值 */
function findDuplicates(arr) {
    const seen = new Set()
    const duplicates = new Set()

    arr.forEach((item) => {
        if (seen.has(item)) {
            duplicates.add(item)
        } else {
            seen.add(item)
        }
    })

    return [...duplicates]
}
// 调用函数，生成1到9之间的随机数
function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min
}

function isTradingHours(now = new Date()) {
    const t = typeof now === 'string' ? dayjs(now) : dayjs(now)
    if (!t || !t.isValid()) return false

    const day = t.day() // 0 Sunday,6 Saturday
    if (day === 0 || day === 6) return false

    const time = t.format('HH:mm')
    // 简单判断：周一到周五 09:30 - 15:00 之间视为交易时段（包含午休）
    return time >= '09:30' && time <= '15:00'
}

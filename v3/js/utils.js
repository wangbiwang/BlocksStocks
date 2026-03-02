// import localforage from 'localforage';

// 确保 myIndexedDB 在使用之前已经被初始化
const myIndexedDB = localforage.createInstance({
    name: 'myIndexedDB',
})
async function setLocalforage(key, value) {
    try {
        await myIndexedDB.setItem(key, value)  //暂时关闭

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
    if (num > 0) {
        return `<span class="red">${s}</span>`
    } else if (num < 0) {
        return `<span class="green">${s}</span>`
    } else {
        return num
    }
}
/* 数字格式化 */
function formatNumber(num, type) {
    if (num === '-' || num === '' || num === null || num === undefined) return '-'
    num = Number(num)
    let s = ''
    let isNegative = Number(num) < 0 // 标记是否为负数
    num = Math.abs(num) // 转换为正数以方便处理

    if (num < 10) {
        s = Number(num).toFixed(2)
    } else if (num < 10000) {
        s = num.toString() // 直接转换为字符串
    } else if (num < 10 ** 7) {
        s = (num / 10000).toFixed(0) + '万' // 数字在一万到一千万之间
    } else if (num < 10 ** 8) {
        s = (num / 10 ** 8).toFixed(2) + '亿' // 数字在一千万到1亿之间
    } else if (num < 10 ** 10) {
        s = (num / 10 ** 8).toFixed(1) + '亿' // 数字在1亿到100亿之间
    } else {
        s = (num / 10 ** 8).toFixed(0) + '亿' // 数字在100亿以上
    }
    if (type == 'shizhi') {
        return s
    }
    if (type == 'gujia') {
        return Number(s).toFixed(2)
    }
    if (!isNegative) {
        return `<span class="red">${s}</span>`
    } else {
        return `<span class="green">-${s}</span>`
    }
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

/* 判断当前时间是在周一到周五之间 9：30到15：00之间 */
function isTradingHours() {
    const now = new Date()
    const day = now.getDay()
    const hours = now.getHours()
    const minutes = now.getMinutes()

    // 判断是否为周一到周五
    if (day === 0 || day === 6) {
        return false
    }

    // 判断是否在9:30到15:00之间
    if (hours < 9 || (hours === 9 && minutes < 30) || hours >= 15) {
        return false
    }

    return true
}

/**
 * v4 工具函数模块
 * 优化内容：
 *   - 修复 precentformater(0) 返回类型不一致的问题
 *   - 修复 formatNumber('gujia') 的 NaN 问题
 *   - 添加 safeNum 数值安全转换辅助函数
 */

/* ================================================================
 * IndexedDB 持久化存储
 * ================================================================ */
const myIndexedDB = localforage.createInstance({
    name: 'myIndexedDB',
})

/**
 * 写入 IndexedDB
 * @param {string} key
 * @param {*} value
 */
async function setLocalforage(key, value) {
    try {
        await myIndexedDB.setItem(key, value)
    } catch (err) {
        console.error(`Error setting ${key} to IndexedDB:`, err)
    }
}

/**
 * 读取 IndexedDB
 * @param {string} key
 * @returns {*|false} 值或 false
 */
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

/* ================================================================
 * 数值安全转换
 * ================================================================ */

/**
 * 安全转换为 Number
 * @param {*} val
 * @param {number} [fallback=0]
 * @returns {number}
 */
function safeNum(val, fallback = 0) {
    if (val === '-' || val === '' || val === null || val === undefined) return fallback
    const n = Number(val)
    return isNaN(n) ? fallback : n
}

/* ================================================================
 * 格式化函数
 * ================================================================ */

/**
 * 百分比格式化（带颜色标记）
 * @param {number|string} num
 * @param {number} [decimals=2] 小数位数
 * @returns {string} HTML 字符串
 */
function precentformater(num, decimals = 2) {
    // 修复：0 也应该正常格式化，不返回裸数字
    if (num === '-' || num === '' || num === null || num === undefined) return '-'
    const value = Number(num)
    if (isNaN(value)) return '-'
    const s = value.toFixed(decimals) + '%'
    if (value > 0) {
        return `<span class="red">${s}</span>`
    } else if (value < 0) {
        return `<span class="green">${s}</span>`
    } else {
        // 修复：零值返回格式化后的字符串，保持类型一致
        return `<span>${s}</span>`
    }
}

/**
 * 数字格式化（大数转万/亿，带颜色标记）
 * @param {number|string} num
 * @param {string} [type] 'shizhi' | 'gujia' | 其他（带颜色）
 * @returns {string} HTML 字符串
 */
function formatNumber(num, type) {
    if (num === '-' || num === '' || num === null || num === undefined) return '-'
    let value = Number(num)
    if (isNaN(value)) return '-'

    let isNegative = value < 0
    value = Math.abs(value)

    let s = ''
    if (value < 10) {
        s = value.toFixed(2)
    } else if (value < 10000) {
        s = value.toString()
    } else if (value < 10 ** 7) {
        s = (value / 10000).toFixed(0) + '万'
    } else if (value < 10 ** 8) {
        s = (value / 10 ** 8).toFixed(2) + '亿'
    } else if (value < 10 ** 10) {
        s = (value / 10 ** 8).toFixed(1) + '亿'
    } else {
        s = (value / 10 ** 8).toFixed(0) + '亿'
    }

    // 市值类型：不带颜色
    if (type === 'shizhi') {
        return s
    }

    // 估价类型：纯数字格式化（修复：直接对原始 value 取小数，不 parse 带单位的字符串）
    if (type === 'gujia') {
        return value.toFixed(2)
    }

    // 默认：带颜色标记
    if (!isNegative) {
        // 正数/零
        return `<span class="red">${s}</span>`
    } else {
        return `<span class="green">-${s}</span>`
    }
}

/* ================================================================
 * 环境判断
 * ================================================================ */

/**
 * 判断是否为移动设备
 * @returns {boolean}
 */
function isMobile() {
    return /phone|pad|pod|iPhone|iPod|ios|iPad|Android|Mobile|BlackBerry|IEMobile|MQQBrowser|JUC|Fennec|wOSBrowser|BrowserNG|WebOS|Symbian|Windows Phone/i.test(
        navigator.userAgent
    )
}

/**
 * 判断当前是否在交易时段（周一至周五 9:30-15:00）
 * @returns {boolean}
 */
function isTradingHours() {
    const now = new Date()
    const day = now.getDay()
    const hours = now.getHours()
    const minutes = now.getMinutes()

    if (day === 0 || day === 6) return false
    if (hours < 9 || (hours === 9 && minutes < 30) || hours >= 15) return false

    return true
}

/* ================================================================
 * 数组/集合工具
 * ================================================================ */

/**
 * 找出数组中重复出现的值
 * @param {Array} arr
 * @returns {Array} 重复值数组
 */
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

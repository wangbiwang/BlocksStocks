/**
 * v4 代理客户端
 * 当本地代理服务运行时，自动通过代理转发请求到同花顺
 * 否则降级为直连
 *
 * 使用方式：
 *   1. 在 service/ 目录下运行: npm start
 *   2. v4 页面自动检测代理服务是否可用
 *   3. 可用 → 通过代理池轮换 IP 访问同花顺
 *   4. 不可用 → 降级直连
 */

const PROXY_SERVER_URL = 'http://localhost:3000';

/**
 * 检查代理服务是否运行
 * @returns {Promise<boolean>}
 */
async function checkProxyAvailable() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    const resp = await fetch(`${PROXY_SERVER_URL}/api/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (resp.ok) {
      const data = await resp.json();
      console.log(`🛡️  代理服务可用: ${data.pool?.healthyCount || 0} 个代理在线`);
      return true;
    }
    return false;
  } catch {
    console.log('⚠️  代理服务未运行，降级为直连模式');
    return false;
  }
}

/**
 * 通过代理发送请求
 * @param {object} axiosConfig - hexin_vJsRequests 返回的完整配置
 * @param {number} [timeout=15000]
 * @returns {Promise<object>} { status, data }
 */
async function proxyRequest(axiosConfig, timeout = 15000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const resp = await fetch(`${PROXY_SERVER_URL}/api/proxy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: axiosConfig.method,
        url: axiosConfig.url,
        headers: {
          'hexin-v': axiosConfig.headers?.['hexin-v'] || '',
          'content-type': axiosConfig.headers?.['Content-Type'] || '',
        },
        data: axiosConfig.data,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const result = await resp.json();

    if (!resp.ok || result.error) {
      throw new Error(result.error || result.detail || `HTTP ${resp.status}`);
    }

    return {
      status: result.status,
      data: result.data,
      _proxy: result.proxy,
      _latency: result.latency,
    };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('代理请求超时');
    }
    throw err;
  }
}

// 全局状态
let _proxyAvailable = null;

/**
 * 初始化代理模式（应用启动时调用一次）
 * @returns {Promise<boolean>}
 */
async function initProxyMode() {
  _proxyAvailable = await checkProxyAvailable();
  return _proxyAvailable;
}

/**
 * 当前是否使用代理模式
 * @returns {boolean}
 */
function isProxyMode() {
  return _proxyAvailable === true;
}

/**
 * 如果代理可用，返回代理请求函数；否则返回 null
 */
function getProxyRequestFn() {
  return _proxyAvailable ? proxyRequest : null;
}

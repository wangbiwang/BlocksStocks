/**
 * V5 代理客户端
 * 检测 localhost:3001 浏览器代理是否可用
 * 可用 → 通过代理获取数据（chameleon 自动注入 hexin-v，绕过 CORS）
 * 不可用 → 直连（会 CORS 报错）
 */
const BROWSER_PROXY_URL = 'http://localhost:3001';

let _proxyAvailable = false;

async function checkProxyAvailable() {
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 3000);
    const resp = await fetch(`${BROWSER_PROXY_URL}/api/health`, { signal: ctrl.signal });
    clearTimeout(tid);
    if (resp.ok) {
      console.log('V5 浏览器代理已连接');
      return true;
    }
  } catch {}
  console.log('代理未运行，直连模式（会 CORS 报错）');
  return false;
}

let _forceNoCache = false;
function setNoCache(v) { _forceNoCache = v; }

async function proxyRequest(axiosConfig, timeout = 20000) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), timeout);

  try {
    const resp = await fetch(`${BROWSER_PROXY_URL}/api/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: axiosConfig.data?.question || '',
        type: axiosConfig.data?.secondary_intent || 'zhishu',
        perpage: axiosConfig.data?.perpage || 100,
        page: axiosConfig.data?.page || 1,
        nocache: _forceNoCache || undefined,
      }),
      signal: ctrl.signal,
    });
    clearTimeout(tid);
    const result = await resp.json();
    if (!resp.ok || result.error) throw new Error(result.error || `HTTP ${resp.status}`);

    return {
      status: result.status,
      data: {
        data: {
          answer: [{ txt: [{ content: { components: [{ data: { datas: result.data || [] } }] } }] }],
        },
      },
    };
  } catch (err) {
    clearTimeout(tid);
    if (err.name === 'AbortError') throw new Error('请求超时');
    throw err;
  }
}

async function forceNoCache() { _forceNoCache = true; }

async function initProxyMode() {
  _proxyAvailable = await checkProxyAvailable();
  return _proxyAvailable;
}

function isProxyMode() {
  return _proxyAvailable;
}

function getProxyRequestFn() {
  return _proxyAvailable ? proxyRequest : null;
}

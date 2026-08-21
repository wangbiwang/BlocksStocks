/**
 * V5 hexin-v 模块（精简版）
 * chameleon.1.9.min.js 在浏览器代理中处理 hexin-v 生成
 * 本模块只提供兼容性包装，确保 v() 和 hexin_vJsRequests() 可用
 */

/**
 * 获取 hexin-v 令牌
 * 优先从 localStorage 读取（chameleon 写入）
 * 备用：从 cookie 读取
 */
function v() {
    const token = localStorage.getItem('hexin-v');
    if (token) return token;
    const cm = document.cookie.match(/v=([^;]+)/);
    return cm ? cm[1] : '';
}

/**
 * 构建同花顺 API 请求配置
 */
function hexin_vJsRequests(type, url, page = 1, perpage = 100) {
    return {
        withCredentials: true,
        method: 'post',
        url: 'https://www.iwencai.com/customized/chart/get-robot-data',
        headers: { 'hexin-v': v() },
        data: {
            source: 'Ths_iwencai_Xuangu',
            version: '2.0',
            query_area: '',
            block_list: '',
            add_info: '{"urp":{"scene":1,"company":1,"business":1},"contentType":"json","searchInfo":true}',
            question: url,
            perpage: perpage,
            page: page,
            secondary_intent: type,
            log_info: '{"input_type":"typewrite"}',
            rsh: '638281508',
        },
    };
}

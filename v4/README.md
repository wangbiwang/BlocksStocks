# BlocksStocks v4

## 版本说明
v4 是基于 v3 的架构优化版本。**策略筛选逻辑与 v3 完全一致**，所有改动聚焦于代码架构、性能、可维护性和健壮性。

## v4 vs v3 优化摘要

### 代码架构去重
- **请求模块工厂化**：`createDataModule()` 抽象 Industries/Concepts/Stocks 共用的缓存检查、串行请求、重试机制和状态管理，三处 ~100 行的重复代码合一
- **策略条件函数化**：将分散在 6+ 处的 Block/Stock 强势判断逻辑抽取为 `evaluateBlockStrong()` 和 `evaluateStockStrong()` 纯函数，统一由 `strategy.js` 导出
- **策略阈值常量化**：所有硬编码的魔法数字（0.75, 1.5, 5, 60 等）统一归入 `STRATEGY_CONFIG` 对象，修改阈值只需改一处

### 性能优化
- **AbortController 请求中断**：切换日期 / 板块时自动中断进行中的请求，避免数据竞争
- **DEBUG 开关**：生产环境下关闭所有 `console.log` 调试输出（`const DEBUG = false`），点击行不再输出 70+ 行 JSON

### 健壮性修复
- **请求中断后状态恢复**：中断的请求不会留下"加载中"状态
- **数据处理错误边界**：`dataHandler` 回调用 try-catch 包裹，API 格式异常不会导致静默失败
- **资源清理完善**：`onUnmounted` 会清理 `Intervals.timer`、`Backtest.timeoutId` 和所有进行中的 `AbortController`
- **修复 `jumpToValidDate` 传参 bug**：移除多余的 3 个 `null` 参数

### Bug 修复 (utils.js)
- `precentformater(0)` 返回 `"0.00%"` 字符串而非裸数字 `0`
- `formatNumber(x, 'gujia')` 不再对带单位的字符串做 `Number()` 转换导致 `NaN`

### CSS 变量化
- 所有颜色、间距、圆角统一为 CSS 自定义属性（Design Tokens）
- 深色/浅色主题只需覆写变量，无需重复选择器

## 主要特性

### 布局设计
- **上部分**：左右分栏布局
  - 左侧：行业策略表格（09:35涨跌幅降序）
  - 右侧：概念策略表格（09:35涨跌幅降序）
- **下部分**：Stock 策略表格（热度排名升序）

### 筛选模式
- 每个面板支持「全部」/「强势」两种筛选模式
- 点击行业/概念行加载对应板块的 Stock 数据
- 支持日期回测自动切换

## 技术架构

### 核心技术栈
- Vue 3.4.14
- Element Plus 2.7.7
- ECharts 5.5.0
- Axios 1.6.7
- Day.js
- LocalForage（IndexedDB 封装）
- hexin-v.js（同花顺 API 请求）
- JSZip（数据打包下载）

### 模块结构
```
v4/
├── index.html              # 主页面
├── css/
│   └── index.css           # 样式文件（CSS 变量化）
├── lib/
│   ├── *.js, *.css         # 第三方库（与 v3 相同）
└── js/
    ├── index.js            # 主应用逻辑（工厂模式重构）
    ├── strategy.js         # 策略函数 + 可复用条件判断
    └── utils.js            # 工具函数（边界修复）
```

### 关键函数

**strategy.js**
- `STRATEGY_CONFIG`：策略阈值常量集合
- `handleRate()`：处理数据并计算基本指标
- `getQuestions()`：生成 API 查询问题
- `evaluateBlockStrong()`：Block 强势条件判断（可复用）
- `evaluateStockStrong()`：Stock 强势条件判断（可复用）
- `isBlockStrong()`：供 Stock 匹配用的 Block 强势判断

**index.js**
- `createDataModule()`：通用数据请求模块工厂
- `fetchWithRetry()`：带重试和中断控制的请求函数
- `getBlockContext()`：获取当前选中 Block 的上下文信息
- `Dates` 模块：日期管理和交易日历
- `Submit()`、`changeDate()`、`jumpToValidDate()`：核心操作

## 使用说明

### 启动方式
```bash
cd v4
python -m http.server 8080
# 或
npx http-server -p 8080
```

### 操作说明
1. 选择日期 → 点击「查询」获取 Block 数据
2. 点击行业/概念行加载对应 Stock 数据
3. 使用「全部/强势」按钮切换筛选模式
4. 使用左右箭头切换相邻交易日
5. 使用双箭头跳转到有强势结果的下一个日期
6. 「回测」按钮支持自动按间隔遍历历史数据

## v3 → v4 迁移说明
- 策略逻辑 **完全不变**，筛选结果应与 v3 一致
- API 请求参数格式不变
- IndexedDB 缓存格式兼容
- 如需开启调试日志，在 `js/index.js` 中将 `DEBUG` 改为 `true`

## 数据来源
- 同花顺 API（通过 hexin-v.js）
- 交易日历：腾讯财经接口

## 浏览器兼容性
- Chrome 90+
- Edge 90+
- Firefox 88+
- Safari 14+

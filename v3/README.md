# BlocksStocks v3

## 版本说明
v3版本是基于v2架构扩展的新版本，实现了全新的上下左右布局和更精细的策略筛选功能。

## 主要特性

### 布局设计
- **上部分（55%）**：左右分栏布局
  - 左侧：Stock策略表格（热度排名升序）
  - 右侧：Block策略表格（涨跌幅降序）
- **下部分（45%）**：集合图展示
  - 散点图展示Block和Stock的分布情况
  - X轴：涨跌幅，Y轴：大单净量

### Stock策略筛选条件
1. 大单净量 > 0.4
2. 涨跌幅 > 4%
3. 成交量是5日均量2倍以上
4. 前30交易日振幅小于20%
5. 大单净额创前30交易日新高
6. 收盘价大于30日均线
7. 主板创业非ST（过滤ST和退市股票）
8. 行业或者概念
9. 热度排名升序

### Block策略筛选条件
1. 涨跌幅 > 1.5%
2. 大单净量 > 0.2
3. 上涨家数占比 > 60%
4. 涨停家数 > 0
5. 收盘价大于30日均线
6. 3交易日资金流向正
7. 10交易日涨幅 < 25%
8. 二级行业或者概念
9. 涨跌幅降序

## 技术架构

### 核心技术栈
- Vue 3.4.14
- Element Plus 2.7.7
- ECharts 5.5.0（新增）
- Axios 1.6.7
- Day.js
- LocalForage（IndexedDB封装）
- hexin-v.js（同花顺API请求）

### 模块结构
```
v3/
├── index.html          # 主页面
├── css/
│   └── index.css      # 样式文件
└── lib/
    ├── *.js           # 第三方库
    ├── *.css          # Element Plus样式
    └── js/
        ├── index.js     # 主应用逻辑
        ├── strategy.js  # v3策略函数
        └── utils.js    # 工具函数
```

### 关键函数

**strategy.js**
- `handleRate()`: 处理数据并计算基本指标
- `filterStocksByV3Strategy()`: Stock策略筛选
- `filterBlocksByV3Strategy()`: Block策略筛选
- `renderCollectionChart()`: 渲染集合图
- `getQuestions()`: 生成查询问题

**index.js**
- `Dates`模块：日期管理和交易日历
- `Blocks`模块：板块数据获取和处理
- `Stocks`模块：个股数据获取和处理
- `Submit()`: 提交查询
- `changeDate()`: 切换日期

## 使用说明

### 启动方式
1. 使用本地服务器（推荐）：
   ```bash
   # 使用Python
   cd v3
   python -m http.server 8080
   
   # 使用Node.js
   cd v3
   npx http-server -p 8080
   
   # 使用VS Code Live Server
   # 右键index.html -> Open with Live Server
   ```

2. 直接打开：
   - 直接在浏览器中打开 `v3/index.html`
   - 注意：某些功能可能需要服务器环境

### 操作说明
1. **日期选择**：
   - 点击日期选择器选择历史日期
   - 使用左右箭头切换相邻交易日

2. **查询数据**：
   - 点击"查询"按钮获取数据
   - 系统会自动并行获取Block和Stock数据

3. **查看筛选结果**：
   - 左侧表格：显示符合条件的Stock
   - 右侧表格：显示符合条件的Block
   - 下方图表：散点图展示两者分布

4. **数据缓存**：
   - 系统会自动缓存历史数据
   - 再次查询相同日期时会优先使用缓存

## 数据来源
- 同花顺API（通过hexin-v.js）
- 交易日历：腾讯财经接口

## 浏览器兼容性
- Chrome 90+
- Edge 90+
- Firefox 88+
- Safari 14+

## 注意事项
1. 数据请求需要网络连接
2. 首次查询可能需要较长时间
3. 某些数据需要等待交易日收盘后才能获取
4. 建议使用Chrome浏览器以获得最佳体验

## 更新日志
- v3.0.0 (2026-02-03)
  - 新增上下左右布局
  - 实现全新的Stock和Block策略筛选
  - 集成ECharts散点图
  - 优化UI/UX体验

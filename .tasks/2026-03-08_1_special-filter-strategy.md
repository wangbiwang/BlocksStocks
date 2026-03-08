# 背景
文件名：2026-03-08_1
创建于：2026-03-08
创建者：11443
主分支：main
任务分支：task/special-filter-strategy_2026-03-08_1
Yolo 模式：Ask

# 任务描述
新增一个特殊的 Block 筛选以及对应的 Stock 筛选策略：
- Block 条件：如果 09:35 涨跌幅/资金流向/大单净额都为正且都大于 09:33 涨跌幅/资金流向/大单净额且 09:35 涨跌幅>1
- Stock 条件：当点击满足上述条件的 Block 时，Stock 也要 09:35 涨跌幅/资金流向/大单净额都为正且都大于 09:33 对应值且 09:35 涨跌幅>1
- 这是特殊策略，强势策略如果覆盖了它，则已强势策略为主进行后续

# 项目概览
Vue 3 + Element Plus 的股票/板块分析应用

⚠️ 警告：永远不要修改此部分 ⚠️
RIPER-5 协议规则：
- RESEARCH 模式：信息收集和理解
- INNOVATE 模式：头脑风暴解决方案
- PLAN 模式：创建详细技术规范
- EXECUTE 模式：实施计划内容
- REVIEW 模式：验证实施与计划的符合程度
未经明确许可不能在模式之间转换，必须在每个响应开头声明当前模式
⚠️ 警告：永远不要修改此部分 ⚠️

# 分析
需要修改的文件：v3/js/index.js

需要修改的 computed 属性：
1. displayIndustries - 添加特殊策略筛选逻辑
2. displayConcepts - 添加特殊策略筛选逻辑
3. displayStocks - 添加特殊策略筛选逻辑（基于所点击 Block 的状态）

当前强势筛选逻辑位置：
- displayIndustries: 第 536-564 行
- displayConcepts: 第 582-610 行
- displayStocks: 第 628-724 行

# 提议的解决方案
在三个 computed 属性中添加特殊策略判断逻辑：

1. **displayIndustries/displayConcepts**：
   - 在强势筛选逻辑之后，添加特殊策略判断
   - 特殊策略条件：td0935Change > 0 && td0935CapitalFlow > 0 && td0935NetInflow > 0 && td0935Change > td0933Change && td0935CapitalFlow > td0933CapitalFlow && td0935NetInflow > td0933NetInflow && td0935Change > 1
   - 注意：强势策略优先，如果满足强势策略则使用强势策略；否则检查特殊策略

2. **displayStocks**：
   - 首先判断所点击的 Block 是否满足特殊策略条件
   - 如果 Block 满足特殊策略，则对 Stock 应用特殊策略筛选
   - 同样，强势策略优先于特殊策略

# 当前执行步骤："1. 实现特殊策略筛选逻辑"

# 任务进度
[2026-03-08]
- 已修改：v3/js/index.js
- 更改：
  1. displayIndustries: 添加特殊策略筛选逻辑（强势策略优先，不满足时检查特殊策略）
  2. displayConcepts: 添加特殊策略筛选逻辑（同 displayIndustries）
  3. displayStocks: 添加 Block 特殊策略判断和 Stock 特殊策略筛选逻辑
- 原因：实现用户请求的特殊策略筛选功能
- 阻碍因素：无
- 状态：未确认

# 最终审查

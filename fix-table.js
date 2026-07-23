const fs = require('fs');
const html = fs.readFileSync('./v5/index.html', 'utf-8');

const old = '<el-table-column prop="指数简称" label="三级行业" show-overflow-tooltip></el-table-column>';
const idx = html.indexOf(old);
if (idx < 0) { console.log('NOT FOUND'); process.exit(1); }

const end = html.indexOf('</el-table>', idx);

const newCols = [
    '<el-table-column prop="指数简称" label="三级行业" show-overflow-tooltip></el-table-column>',
    '<el-table-column width="45" align="center">',
    '    <template #header><span>只</span></template>',
    '    <template #default="{ row }">{{ row.stockCount }}</template>',
    '</el-table-column>',
    '<el-table-column width="75" align="center">',
    '    <template #header><span>指数涨跌</span></template>',
    '    <template #default="{ row }">',
    '        <span v-html="precentformater(row[Dates.shareDate.td]?.涨跌幅)"></span>',
    '    </template>',
    '</el-table-column>',
    '<el-table-column width="75" align="center">',
    '    <template #header><span>个股均值</span></template>',
    '    <template #default="{ row }">',
    '        <span v-html="precentformater(row.stockAvgChg)"></span>',
    '    </template>',
    '</el-table-column>',
].join('\n                                ');

const result = html.substring(0, end) + newCols + '\n                            ' + html.substring(end);
fs.writeFileSync('./v5/index.html', result, 'utf-8');
console.log('Updated');

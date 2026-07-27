const fs = require('fs');
const html = fs.readFileSync('c:/Users/11443/Desktop/BlocksStocks/v7/index.html', 'utf8');
const lines = html.split('\n');

// FIND: 涨停详情 column - it's after 股票简称, find its start/end
let ztStart = -1, ztEnd = -1;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('涨停详情')) {
        // The <el-table-column for 涨停详情 has width="100"
        for (let j = i - 10; j >= 0; j--) {
            if (lines[j].includes('width="100"') && lines[j].includes('<el-table-column')) {
                ztStart = j;
                break;
            }
        }
        // Find closing
        for (let j = i; j < lines.length; j++) {
            if (lines[j].includes('</el-table-column>') && j > ztStart) {
                ztEnd = j;
                break;
            }
        }
        break;
    }
}
if (ztStart === -1 || ztEnd === -1) { console.log('ERROR: 涨停详情 not found', ztStart, ztEnd); process.exit(1); }

const ztCol = lines.splice(ztStart, ztEnd - ztStart + 1);
console.log('Removed 涨停详情: lines', ztStart, '-', ztEnd, '(' + ztCol.length + ' lines)');
console.log('  first line:', ztCol[0].trim().substring(0, 40));
console.log('  last line:', ztCol[ztCol.length-1].trim().substring(0, 40));

// FIND: Stock table's 热度排名 column end
// Look for the unique 'red f600' pattern
let hotColEnd = -1;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('red f600')) {
        // Find the closing </el-table-column>
        for (let j = i; j < lines.length; j++) {
            if (lines[j].includes('</el-table-column>')) {
                hotColEnd = j;
                break;
            }
        }
        break;
    }
}
if (hotColEnd === -1) { console.log('ERROR: 热度排名 not found'); process.exit(1); }

lines.splice(hotColEnd + 1, 0, ...ztCol);
console.log('Inserted 涨停详情 after 热度排名 (line', hotColEnd, ')');

fs.writeFileSync('c:/Users/11443/Desktop/BlocksStocks/v7/index.html', lines.join('\n'));
console.log('Done');

// Verify
const html2 = fs.readFileSync('c:/Users/11443/Desktop/BlocksStocks/v7/index.html', 'utf8');
console.log('最终 - 涨停详情出现次数:', (html2.match(/涨停详情/g) || []).length);

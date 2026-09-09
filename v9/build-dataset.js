/* 构建全量特征-标签数据集：每天被点开板块的全部个股 + 板块/龙头/分时/情绪特征 + 未来收益标签 */
const fs=require('fs');const path=require('path');const https=require('https');const vm=require('vm');
const ROOT=path.join(__dirname,'..','v8','cache');const OUT=__dirname;
const sandbox={};vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname,'js','strategy.js'),'utf8'),sandbox);
const {handleRate,evaluateBlockStrong,evaluateStockStrong,evaluateBlockStrongV9}=sandbox;
function loadRows(f){try{const j=JSON.parse(fs.readFileSync(f,'utf8'));return j?._raw?.data?.answer?.[0]?.txt?.[0]?.content?.components?.[0]?.data?.datas||[];}catch(e){return null;}}
function fd(k,p){const s=new Set();for(const x of k){const m=x.match(p);if(m)s.add(m[1]);}return s;}
function classify(arr){const k=Object.keys(arr[0]||{});return{t0935:fd(k,/(\d{8}) 09:35/),plain:fd(k,/涨跌幅:前复权\[(\d{8})\]/),ma:fd(k,/均线\[(\d{8})\]/),macd:fd(k,/macd\((?:diff|dea)值\)\[(\d{8})\]/),vol:fd(k,/成交量\[(\d{8})\]/),lt:fd(k,/(?:首次涨停时间|连续涨停天数)\[(\d{8})\]/),limitUpCount:k.some(x=>x.includes('涨停家数')),has0935:k.some(x=>x.includes('09:35'))};}
const files=[];
(function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(e.name.endsWith('.json')){const arr=loadRows(p);if(!arr||!arr.length)continue;const rel=p.slice(ROOT.length+1).replace(/\\/g,'/');const seg=rel.split('/');const kind=seg.includes('stock')?'stock':'block';const tf=kind==='block'?seg[1]:seg[2];files.push({rel,kind,typeFolder:tf,arr});}}})(ROOT);
for(const f of files)f.sig=classify(f.arr);
function normCode(c){const s=String(c);if(/^(sh|sz|bj)/i.test(s))return s.toLowerCase();if(/^(60|68|9)/.test(s))return 'sh'+s;if(/^(0|3)/.test(s))return 'sz'+s;return 'bj'+s;}
function fetchKline(code,days){return new Promise((res,rej)=>{const url=`https://proxy.finance.qq.com/ifzqgtimg/appstock/app/newfqkline/get?_var=kline_dayqfq&param=${normCode(code)},day,,,${days},qfq`;https.get(url,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{const j=JSON.parse(d.replace(/^[^=]*=/,''));const o=j?.data?.[normCode(code)];res(o?.qfqday||o?.day||[]);}catch(e){rej(e)}})}).on('error',rej);});}
const barDate=bars=>new Map(bars.map(b=>[String(b[0]).replace(/-/g,''),{open:+b[1],close:+b[2],high:+b[3],low:+b[4]}]));
(async()=>{
  const cal=JSON.parse(fs.readFileSync(path.join(OUT,'calendar.json'),'utf8'));
  const idxOf=new Map(cal.map((d,i)=>[d,i]));
  const dateInfo=d=>{const i=idxOf.get(d);if(i===undefined)return null;return{td:d,pd1:cal[i-1],pd2:cal[i-2],pd3:cal[i-3],pd4:cal[i-4],nd1:cal[i+1],nd2:cal[i+2],nd3:cal[i+3],nd4:cal[i+4],nd5:cal[i+5]};};
  const kcFile=path.join(OUT,'kline-cache.json');const kc=fs.existsSync(kcFile)?JSON.parse(fs.readFileSync(kcFile,'utf8')):{};
  async function getBars(code){const key=normCode(code);if(kc[key]&&kc[key].length)return kc[key];await new Promise(r=>setTimeout(r,25));const arr=await fetchKline(key,600).catch(()=>[]);kc[key]=arr||[];return kc[key];}
  const runDates=[...new Set(files.flatMap(f=>[...f.sig.t0935]))].filter(d=>dateInfo(d)).sort();
  const records=[];const codeSet=new Set();
  const pick=(kind,tf,pred)=>files.filter(f=>f.kind===kind&&f.typeFolder===tf&&pred(f.sig));
  // precompute block maps per run
  for(const D of runDates){
    if(D>='20260903')continue;
    const di=dateInfo(D);const pd1=di.pd1;
    const blockObjs={};const blockStrongNames=new Set();
    const nStrong={行业:0,概念:0};
    for(const bt of ['行业','概念']){
      const q0=pick('block',bt,s=>s.t0935.has(D)&&s.has0935);
      const q1=pick('block',bt,s=>s.ma.has(pd1)&&!s.macd.has(pd1));
      const q2=pick('block',bt,s=>s.macd.has(pd1));
      const a0=q0[0]?.arr,a1=q1[0]?.arr,a2=q2[0]?.arr;
      if(!a0||!a1||!a2)continue;
      const m0=new Map(a0.map((it,i)=>[it.code,{item:it,rank:i+1}]));
      const m1=new Map(a1.map(it=>[it.code,it]));const m2=new Map(a2.map(it=>[it.code,it]));
      const merged=[];
      m0.forEach((v0,code)=>{if(m1.has(code)&&m2.has(code)){const mr={...v0.item,...m1.get(code),...m2.get(code)};mr['09:35涨跌幅排名']=v0.rank;const obj={};handleRate(obj,mr,'block',di);merged.push(obj);}});
      merged.sort((a,b)=>(b[pd1]?.涨跌幅??-1e9)-(a[pd1]?.涨跌幅??-1e9));merged.forEach((it,i)=>it['昨日涨跌幅排名']=i+1);
      for(const b of merged){
        const name=b['指数简称']||'';const folderKey=`${bt}-${name.replace(/[^a-zA-Z0-9_一-鿿]/g,'_').slice(0,30)}`;
        blockObjs[folderKey]={bt,name,obj:b,strong:evaluateBlockStrong(b,di).isStrong,strongV9:evaluateBlockStrongV9(b,di).isStrong};
        if(blockObjs[folderKey].strongV9)nStrong[bt]++;
      }
    }
    // stocks in clicked blocks
    const stockQ0=files.filter(f=>f.kind==='stock'&&f.sig.t0935.has(D));
    const seen=new Set();
    for(const f0 of stockQ0){
      const bk=f0.typeFolder;if(seen.has(bk))continue;seen.add(bk);
      const blockMeta=blockObjs[bk]||null;
      if(!blockMeta){/* 没有对应板块，跳过 */ continue;}
      const [bt,bn]=bk.split('-');
      const bfs=files.filter(f=>f.kind==='stock'&&f.typeFolder===bk);
      const q1f=bfs.find(f=>f.sig.ma.has(pd1)&&!f.sig.macd.has(pd1));
      const q2f=bfs.find(f=>f.sig.macd.has(pd1));
      const q3f=bfs.find(f=>f.sig.lt.has(pd1));
      const a1=q1f?.arr||(q2f&&q2f.sig.ma.has(pd1)?q2f.arr:null);
      const a2=q2f?.arr||null;const a3=q3f?.arr||null;
      const m1=a1?new Map(a1.map(it=>[it.code,it])):null;const m2=a2?new Map(a2.map(it=>[it.code,it])):null;const m3=a3?new Map(a3.map(it=>[it.code,it])):null;
      const objs=[];
      for(const row of f0.arr){
        const merged={...row};if(m1?.has(row.code))Object.assign(merged,m1.get(row.code));if(m2?.has(row.code))Object.assign(merged,m2.get(row.code));if(m3?.has(row.code))Object.assign(merged,m3.get(row.code));
        const obj={};handleRate(obj,merged,'stock',di);objs.push(obj);
      }
      // rank within block
      const rank0935=new Map([...objs].sort((a,b)=>(b[`${D} 09:35`]?.涨跌幅??-1e9)-(a[`${D} 09:35`]?.涨跌幅??-1e9)).map((o,i)=>[o.code,i+1]));
      const rankPd1=new Map([...objs].sort((a,b)=>(b[pd1]?.涨跌幅??-1e9)-(a[pd1]?.涨跌幅??-1e9)).map((o,i)=>[o.code,i+1]));
      for(const o of objs){
        const c=String(o.code||'');const main=/^(60|00)/.test(c);
        const chg0935=o[`${D} 09:35`]?.涨跌幅||0;const chg0933=o[`${D} 09:33`]?.涨跌幅||0;const pd1Chg=o[pd1]?.涨跌幅||0;
        const b=blockMeta.obj;
        records.push({
          D,code:c,name:o['股票简称']||'',block:bn,blockType:bt,
          s_pd1Chg:+pd1Chg.toFixed(3),s_chg0933:+chg0933.toFixed(3),s_chg0935:+chg0935.toFixed(3),s_delta:+(chg0935-chg0933).toFixed(3),
          s_heat:o[pd1]?.热度排名==null?9999:+o[pd1]?.热度排名,
          s_pd1Net:o[pd1]?.大单净额||0,s_pd1Flow:o[pd1]?.资金流向||0,
          s_mainBoard:main?1:0,
          s_rank0935:rank0935.get(o.code),s_rankPd1:rankPd1.get(o.code),
          s_isLimitPd1:pd1Chg>=(main?9.5:19.5)?1:0,
          s_isLimit0935:chg0935>=(main?9.5:19.5)?1:0,
          s_v8strong:evaluateStockStrong(o,di).isStrong?1:0,
          s_cond:evaluateStockStrong(o,di).conditions,
          b_pd1Chg:+(b[pd1]?.涨跌幅||0).toFixed(3),b_chg0935:+(b[`${D} 09:35`]?.涨跌幅||0).toFixed(3),
          b_limitUpCount:b.limitUpCount||0,b_strong:blockMeta.strong?1:0,b_strong_v9:blockMeta.strongV9?1:0,b_rank0935:b['09:35涨跌幅排名']||9999,b_rankPd1:b['昨日涨跌幅排名']||9999,
          nStrongInd:nStrong.行业,nStrongCon:nStrong.概念,nStrongBlocks:nStrong.行业+nStrong.概念,
        });
        codeSet.add(c);
      }
      seen.add(bk);
    }
  }
  // fetch kline for all codes and attach labels
  console.log('records before label:',records.length,'codes:',codeSet.size);
  const barsMap={};for(const c of codeSet){const key=normCode(c);if(!kc[key]||!kc[key].length){const arr=await fetchKline(key,600).catch(()=>[]);kc[key]=arr||[];}barsMap[key]=kc[key];}
  let labeled=0;
  for(const rec of records){
    const key=normCode(rec.code);const bars=barsMap[key]||[];const bm=barDate(bars);
    const di=dateInfo(rec.D);if(!di)continue;
    const prev=bm.get(di.pd1),d0=bm.get(rec.D);
    if(!prev||!d0)continue;
    const entry=prev.close*(1+(rec.s_chg0935||0)/100);
    const mk=(date)=>{const bb=bm.get(date);if(!bb)return null;return (bb.close/entry-1)*100;};
    rec.r0=mk(rec.D);rec.o1=mk(di.nd1);rec.o2=mk(di.nd2);rec.o3=mk(di.nd3);rec.o5=mk(di.nd5);
    if(bm.has(rec.D)){const bd=bm.get(rec.D);rec.lowD=(bd.low/entry-1)*100;rec.highD=(bd.high/entry-1)*100;}
    labeled++;
  }
  fs.writeFileSync(path.join(OUT,'kline-cache.json'),JSON.stringify(kc));
  fs.writeFileSync(path.join(OUT,'dataset.json'),JSON.stringify(records,null,0));
  console.log('labeled rows:',labeled,'total records:',records.length);
  // quick stats: v8 baseline on labeled
  const lab=records.filter(r=>r.r0!=null||r.o1!=null);
  const v8=lab.filter(r=>r.s_v8strong===1);
  console.log('v8 strong rows:',v8.length,'o1 win:',(v8.filter(r=>r.o1>0).length/(v8.filter(r=>r.o1!=null).length||1)*100).toFixed(1),'avg o1:',(v8.reduce((a,b)=>a+(b.o1||0),0)/(v8.filter(r=>r.o1!=null).length||1)).toFixed(2));
})().catch(e=>{console.error(e);process.exit(1);});

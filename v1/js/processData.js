// 加载原始数据
fetch('./data.json')
  .then(response => response.json())
  .then(originalData => {
    // 处理数据，删除指定字段
    const processedData = {
      LV2: originalData.LV2.map(item => {
        // 创建新对象，避免修改原对象
        const newItem = { ...item };
        // 删除指定字段
        delete newItem['指数@收盘价:不复权[20251121]'];
        delete newItem['指数@涨跌幅:前复权[20251121]'];
        return newItem;
      })
    };
    
    // 下载处理后的数据
    const blob = new Blob([JSON.stringify(processedData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'processed_data.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    console.log('数据处理完成，已下载到 processed_data.json 文件');
  })
  .catch(error => {
    console.error('处理数据时出错:', error);
  });
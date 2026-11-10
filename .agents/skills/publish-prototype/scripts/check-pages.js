// 在瀏覽器裡一次檢查發佈版本的所有頁面。只在本機用，不會發佈。
// build.js 會在開頭加上 PAGES，輸出成 .build/site/__check.js。
// 用法：在發佈版本的任一頁執行 (await import('/__check.js')).default()
const WIDTHS = [320, 1280];
const LOAD_TIMEOUT = 8000;
const PARALLEL = 6;
const NOT_RENDERED = ['找不到這個頁面。', '你沒有檢視這個頁面的權限。'];

const inspect = (url, width) =>
  new Promise(resolve => {
    const frame = document.createElement('iframe');
    frame.style.cssText = `position:fixed;left:-${width + 100}px;top:0;width:${width}px;height:800px;border:0`;
    const finish = result => {
      clearTimeout(timer);
      frame.remove();
      resolve({ url, width, ...result });
    };
    const timer = setTimeout(() => finish({ problems: ['載入逾時'], links: [] }), LOAD_TIMEOUT);
    frame.onload = () => {
      const win = frame.contentWindow;
      const doc = frame.contentDocument;
      const root = doc.documentElement;
      const problems = [];
      if (root.scrollWidth > root.clientWidth) problems.push(`水平捲動：內容 ${root.scrollWidth} px，視窗 ${root.clientWidth} px`);
      for (const r of win.performance.getEntriesByType('resource')) {
        if (r.responseStatus >= 400) problems.push(`資源載入失敗（${r.responseStatus}）：${r.name}`);
      }
      const view = doc.querySelector('#view');
      if (!win.GH) problems.push('共用程式沒有載入');
      // GH.page 跑完才有 GH.refresh。主頁和分享頁沒有 App Shell，#view 可能本來就是空的。
      else if (!win.GH.refresh) problems.push('頁面程式沒有跑完');
      else if (doc.querySelector('.app-shell') && view && !view.textContent.trim()) problems.push('畫面沒有內容');
      const text = doc.body.textContent;
      const rendered = !NOT_RENDERED.some(t => text.includes(t));
      const links = [...doc.querySelectorAll('a[href*=".html?"]')].map(a => a.getAttribute('href'));
      finish({ problems, links, rendered });
    };
    frame.src = url;
    document.body.append(frame);
  });

const runAll = async (jobs, run) => {
  const results = [];
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      results.push(await run(job));
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  return results;
};

export default async function check() {
  const startedAt = Date.now();
  const { GH } = window;
  const role = GH.state.role;
  GH.state.role = 'admin';
  GH.save();
  try {
    const pass = urls => runAll(urls.flatMap(url => WIDTHS.map(width => ({ url, width }))), job => inspect(job.url, job.width));
    const first = await pass(PAGES);
    // 詳情頁要帶參數才有內容，所以每種頁面再挑一個實際連結載入。
    const variant = {};
    for (const r of first) {
      for (const link of r.links || []) {
        const page = link.split('?')[0];
        if (PAGES.includes(page) && !variant[page]) variant[page] = link;
      }
    }
    const second = await pass(Object.values(variant));
    const results = [...first, ...second];
    const problems = results.flatMap(r => r.problems.map(problem => ({ page: r.url, width: r.width, problem })));
    const rendered = new Set(results.filter(r => r.rendered).map(r => r.url.split('?')[0]));
    return {
      ok: problems.length === 0,
      loads: results.length,
      seconds: Math.round((Date.now() - startedAt) / 100) / 10,
      problems,
      notRendered: PAGES.filter(p => !rendered.has(p)),
    };
  } finally {
    GH.state.role = role;
    GH.save();
  }
}

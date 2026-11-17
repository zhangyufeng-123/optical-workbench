import { searchScore } from './device-search.js';

const notes = {
  '光纤与偏振': '查看光纤曲线、接口朝向和偏振器件标注。',
  '量子光学与光子学': '查看分支光路、干涉结构和信号方向的表达。',
  '显微与成像': '查看成像臂、共轭面和空间层次的安排。',
  '激光与非线性': '查看主光束、调制段和折叠光路的构图。',
  '光谱与传感': '查看激发、采集与检测路径的区分。',
  '集成与自由空间光学': '查看芯片与自由空间器件、输入输出端的关系。'
};

export function filterReferences(papers, query = '', category = '') {
  const term=query.trim(),doiQuery=term.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i,'').replace(/^doi\s*:\s*/i,'').toLowerCase();
  const searchByDOI=/^10\.\d{4,9}\//.test(doiQuery);
  return papers.filter(paper => (!category || paper.category === category) && (searchByDOI
    ? paper.doi.toLowerCase().includes(doiQuery)
    : searchScore([paper.title, paper.journal, paper.doi, paper.category, ...(paper.component_terms || [])].join(' '), term) >= 0));
}

export function installNatureReferences({ mount, library, showPanel, applyStyle, draftAI, renderReference }) {
  mount.classList.add('nature-reference-panel');
  const heading = document.createElement('h2'); heading.textContent = 'Nature 光路参考';
  const count = document.createElement('p'); count.className = 'nature-reference-count';
  const search = document.createElement('input'); search.type = 'search'; search.placeholder = '检索论文、DOI 或器件'; search.setAttribute('aria-label', '检索 Nature 光路参考');
  const category = document.createElement('select'); category.setAttribute('aria-label', '光路参考类别');
  for (const value of ['', ...new Set(library.papers.map(paper => paper.category))]) {
    const option = document.createElement('option'); option.value = value; option.textContent = value || '全部光路类别'; category.append(option);
  }
  const preset = document.createElement('button'); preset.className = 'nature-reference-preset'; preset.textContent = '通用白底紧凑图稿'; preset.title = '原色光路、紧凑构图与白底输出';
  const feedback = document.createElement('p'); feedback.className = 'nature-reference-feedback'; feedback.setAttribute('role', 'status'); feedback.setAttribute('aria-live', 'polite'); feedback.hidden = true;
  const list = document.createElement('div'); list.className = 'nature-reference-list'; list.setAttribute('role', 'list');
  const scope=document.createElement('p');scope.className='nature-reference-scope';scope.textContent='Nature系列期刊。图例已完成缩略图级初筛。';
  mount.append(heading, count, scope, search, category, preset, feedback, list);
  const records = new Map(), cards = new Map();
  let selectedDOI = '', activeDOI = '', busy = false, destroyed = false, pending = null, genericPending = false;
  function status(message, failed = false) {
    feedback.textContent = message; feedback.hidden = !message; feedback.classList.toggle('is-error', failed);
  }
  function updateCards() {
    mount.setAttribute('aria-busy', String(busy)); preset.disabled = busy || typeof applyStyle !== 'function';
    for (const [doi, { card, button, state }] of cards) {
      const selected = doi === selectedDOI, record = records.get(doi);
      card.classList.toggle('is-selected', selected); card.setAttribute('aria-current', String(selected)); card.setAttribute('aria-busy', String(activeDOI === doi && busy));
      button.setAttribute('aria-pressed', String(selected)); button.disabled = busy || typeof renderReference !== 'function'; button.textContent = activeDOI === doi && busy ? '正在渲染…' : '按此文献渲染';
      state.textContent = record?.message || ''; state.hidden = !record; state.classList.toggle('is-error', record?.status === 'failed'); state.dataset.status = record?.status || 'idle';
    }
  }
  async function runReference(paper) {
    if (destroyed || busy || typeof renderReference !== 'function') return pending;
    selectedDOI = paper.doi; activeDOI = paper.doi; busy = true;
    records.set(paper.doi, { status: 'rendering', message: '正在按此文献渲染当前光路…' });
    status('正在按《' + paper.title + '》渲染当前光路…'); updateCards();
    pending = (async () => {
      try {
        const result = await renderReference(structuredClone(paper));
        if (destroyed) return result;
        if (result === null) {
          const message = '请先在实验台添加一个可见器件，再按此文献渲染。';
          records.set(paper.doi, { status: 'empty', message }); status(message); return null;
        }
        records.set(paper.doi, { status: 'ready', message: '渲染已完成，可在渲染窗口预览和导出。', renderedAt: new Date().toISOString() });
        status('已按《' + paper.title + '》完成渲染。'); return result;
      } catch (error) {
        if (!destroyed) {
          const message = '渲染未完成，' + (error?.message || String(error));
          records.set(paper.doi, { status: 'failed', message }); status(message, true);
        }
        throw error;
      } finally {
        busy = false; activeDOI = ''; pending = null; if (!destroyed) updateCards();
      }
    })();
    return pending;
  }
  preset.onclick = async () => {
    if (destroyed || busy || typeof applyStyle !== 'function') return;
    busy = true; genericPending = true; selectedDOI = ''; status('正在生成通用白底紧凑图稿…'); updateCards();
    try { const result = await applyStyle(); if (!destroyed) status(result === null ? '请先在实验台添加一个可见器件，再生成通用白底图稿。' : '通用白底图稿已完成，可在渲染窗口预览和导出。'); }
    catch (error) { if (!destroyed) status('渲染未完成，' + (error?.message || String(error)), true); }
    finally { busy = false; genericPending = false; if (!destroyed) updateCards(); }
  };
  function link(label, href) {
    const anchor = document.createElement('a'); anchor.textContent = label; anchor.href = href; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; return anchor;
  }
  function render() {
    if (destroyed) return;
    const papers = filterReferences(library.papers, search.value, category.value);
    count.textContent = `${papers.length} / ${library.papers.length} 篇，论文与图页均已核验`;
    list.replaceChildren(); cards.clear();
    for (const paper of papers) {
      const card = document.createElement('article'); card.className = 'nature-reference-card'; card.dataset.doi = paper.doi; card.setAttribute('role', 'listitem');
      const imageLink = link('', paper.figure_url), image = document.createElement('img');
      image.src = paper.thumbnail_path; image.alt = `${paper.title} ${paper.figure_label}`; image.loading = 'lazy'; image.decoding = 'async'; imageLink.append(image);
      const title = document.createElement('h3'); title.textContent = paper.title;
      const metadata = document.createElement('p'); metadata.className = 'nature-reference-meta'; metadata.textContent = `${paper.journal} · ${paper.year} · ${paper.figure_label} · ${paper.style}`;
      const hint = document.createElement('p'); hint.textContent = paper.borrowable_features?.[0] || notes[paper.category] || '查看器件、光路与标注的组织方式。';
      const button = document.createElement('button'); button.type = 'button'; button.className = 'primary nature-reference-render'; button.dataset.referenceRender = paper.doi; button.textContent = '按此文献渲染';
      button.title = typeof renderReference === 'function' ? '用本软件的三维模型与此文献对应的渲染参数出图' : '此版本尚未连接文献渲染入口';
      button.onclick = () => runReference(paper).catch(() => {});
      const state = document.createElement('p'); state.className = 'nature-reference-state'; state.dataset.referenceStatus = paper.doi; state.setAttribute('role', 'status'); state.setAttribute('aria-live', 'polite');
      const actions = document.createElement('div'); actions.className = 'nature-reference-links'; actions.append(link('论文', paper.article_url), link('图页', paper.figure_url));
      const draft = document.createElement('button'); draft.textContent = '用于 AI 描述';
      draft.onclick = () => draftAI(`请生成用于光学实验示意图的三维器件外观。\n器件名称与结构：请填写。\n期望最长边尺寸：请填写，单位 mm。\n风格参考：${paper.title}，${paper.journal}（${paper.year}），${paper.figure_label}。\n参考 DOI：${paper.doi}\n采用清晰的器件轮廓、简洁材质与可辨识的接口。输出带内嵌纹理的 GLB。`);
      draft.disabled = typeof draftAI !== 'function';
      const detail=document.createElement('details'),summary=document.createElement('summary');detail.className='nature-reference-detail';summary.textContent='图注、署名与 AI 描述';
      const caption=document.createElement('p');caption.textContent=paper.caption;
      const attribution=document.createElement('p');attribution.className='nature-reference-attribution';attribution.textContent=paper.attribution;
      actions.append(draft);detail.append(summary,caption,attribution,link(paper.license,paper.license_url),actions);
      card.append(imageLink, title, metadata, hint, button, state, detail); list.append(card); cards.set(paper.doi, { card, button, state });
    }
    if (!papers.length) { const empty = document.createElement('p'); empty.textContent = '没有匹配结果，可尝试器件英文名或其他类别。'; list.append(empty); }
    updateCards();
  }
  search.oninput = render; category.onchange = render; render();
  return {
    open() { if (!destroyed) showPanel(); }, render, getCount: () => library.papers.length,
    getSelectedReference: () => { const paper = library.papers.find(entry => entry.doi === selectedDOI); return paper ? structuredClone(paper) : null; },
    getState: () => ({ selectedDOI, activeDOI, busy, genericPending, records: Object.fromEntries([...records].map(([doi, record]) => [doi, { ...record }])) }),
    destroy() { if (destroyed) return; destroyed = true; cards.clear(); mount.replaceChildren(); }
  };
}

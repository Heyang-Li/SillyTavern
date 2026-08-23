(() => {
  'use strict';
  const doc = document;
  if (doc.getElementById('kk-status-root')) return;
  const root = doc.createElement('section');
  root.id = 'kk-status-root';
  doc.body.replaceChildren(root);

  const style = doc.createElement('style');
  style.textContent = [
    '#kk-status-root{max-width:920px;margin:8px auto;padding:10px;border:1px solid #514940;border-radius:14px;background:linear-gradient(135deg,#222028,#15151a);color:#eee7dc;font:14px/1.6 "Microsoft YaHei","Noto Sans SC",sans-serif;box-shadow:0 10px 24px #0007}',
    '#kk-status-root *{box-sizing:border-box}.kk-head{display:flex;align-items:end;justify-content:space-between;gap:10px;padding:2px 3px 10px}.kk-eyebrow,.kk-note{margin:0;color:#bda98c;font-size:11px;letter-spacing:.12em}.kk-note{color:#aaa39c;letter-spacing:0}.kk-title{margin:0;font:700 19px/1.2 Georgia,"Songti SC",serif}.kk-tabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;padding:5px;border:1px solid #474149;border-radius:10px;background:#101015}.kk-tab{min-width:0;min-height:40px;border:1px solid transparent;border-radius:7px;background:transparent;color:#d5cfc8;cursor:pointer;font:700 14px inherit}.kk-tab[aria-selected="true"]{background:#39332e;color:#fff8ed}.kk-tab[data-tab="karin"][aria-selected="true"]{background:#351a20;border-color:#86303d;color:#ffe9e9}.kk-tab[data-tab="kana"][aria-selected="true"]{background:#19313f;border-color:#77accd;color:#effaff}',
    '.kk-panel{display:none;margin-top:10px;overflow:hidden;border:1px solid #cbb99e;border-radius:10px;color:#2a241e;background:#f1ebdf}.kk-panel.active{display:block}.kk-panel.karin{border-color:#78323c;color:#f2e5e3;background:linear-gradient(125deg,#371b20,#171416 66%)}.kk-panel.kana{border-color:#8dbbd2;color:#173142;background:linear-gradient(125deg,#d8edf7,#f7fcff 65%)}.kk-panel-head{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;padding:10px 13px;border-bottom:1px solid currentColor}.kk-panel-head h2{margin:0;font:700 17px/1.25 Georgia,"Songti SC",serif}.kk-panel-head span{font-size:11px;opacity:.7}.kk-content{padding:11px 13px 14px}.kk-grid,.kk-organs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.kk-card,.kk-organ{min-width:0;padding:8px 9px;border:1px solid #9b8d7a99;border-radius:7px;background:#fff2}.kk-wide{grid-column:1/-1}.kk-label{display:block;margin-bottom:2px;font-size:10px;letter-spacing:.08em;opacity:.7}.kk-value{font-weight:700}.kk-text,.kk-value,.kk-organ p{display:block;overflow-wrap:anywhere;word-break:break-word;white-space:pre-wrap}.kk-text{line-height:1.68}.kk-section{margin:13px 0 7px;padding-bottom:5px;border-bottom:1px solid #9b8d7a99;font:700 14px/1.3 Georgia,"Songti SC",serif}.kk-bar{height:8px;overflow:hidden;border-radius:99px;background:#0002}.kk-bar i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#805d36,#c5a05c)}.kk-stage{display:flex;justify-content:space-between;gap:8px;margin-top:5px;font-size:11px}.kk-organ strong{display:flex;justify-content:space-between;gap:6px}.kk-organ p{margin:4px 0 0;font-size:11px;opacity:.8}.kk-empty{padding:16px;text-align:center;color:#b9afa4}@media(max-width:600px){#kk-status-root{margin:0;border-radius:0;border-inline:0;padding:8px}.kk-head{align-items:start;flex-direction:column}.kk-grid,.kk-organs{grid-template-columns:1fr}.kk-tab{padding:5px;font-size:12px}.kk-content,.kk-panel-head{padding-inline:10px}}'
  ].join('');
  doc.head.appendChild(style);

  const phaseNames = ['相依为命', '裂痕初现', '争宠对立', '仇怨成形'];
  const organs = ['小穴', '嘴', '阴蒂', '阴道', '屁眼', '胸'];
  let active = 'common';
  const get = (source, path, fallback) => path.split('.').reduce((value, key) => value && value[key] !== undefined ? value[key] : undefined, source) ?? fallback;
  const clean = (value) => String(value ?? '—').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const number = (value) => Math.max(0, Math.min(100, Number(value) || 0));
  const card = (label, value, wide) => '<div class="kk-card' + (wide ? ' kk-wide' : '') + '"><span class="kk-label">' + clean(label) + '</span><span class="' + (wide ? 'kk-text' : 'kk-value') + '">' + clean(value) + '</span></div>';
  const hosts = () => [window, window.parent, window.top].filter((item, index, all) => item && all.indexOf(item) === index);

  async function readState() {
    for (const host of hosts()) {
      try {
        const direct = host.chat_metadata?.variables?.stat_data || host.chat_metadata?.stat_data || host.variables?.stat_data || host.stat_data;
        if (direct && typeof direct === 'object') return direct;
        const helper = host.TavernHelper || host.tavern_helper;
        for (const reader of [helper?.getVariables, host.getVariables]) {
          if (typeof reader !== 'function') continue;
          const value = await reader.call(helper || host);
          const state = value?.stat_data || value?.variables?.stat_data || value;
          if (state?.世界 && (state?.卡琳 || state?.卡娜)) return state;
        }
      } catch (_) {}
    }
    return null;
  }

  function sisterPanel(state, name, theme) {
    const sister = get(state, name, {});
    const levels = get(sister, '开发度', {});
    const organHtml = organs.map((organ) => {
      const item = levels[organ] || {};
      return '<div class="kk-organ"><strong><span>' + organ + '</span><span>' + clean(get(item, '数值', 0)) + ' / 100</span></strong><p>' + clean(get(item, '描述', '未开发。')) + '</p></div>';
    }).join('');
    return '<section class="kk-panel ' + theme + (active === theme ? ' active' : '') + '"><header class="kk-panel-head"><div><h2>' + name + '</h2><span>' + (theme === 'karin' ? '黑红档案 · 姐姐' : '蓝白档案 · 妹妹') + '</span></div><span>独立状态记录</span></header><div class="kk-content"><div class="kk-grid">' + card('位置', get(sister, '位置', '—')) + card('好感度', get(sister, '好感度', 0) + ' / 100') + card('穿着', get(sister, '穿着', '—'), true) + card('当前想法', get(sister, '当前想法', '—'), true) + card('堕落值', get(sister, '堕落值', 0) + ' / 100（仅增加）') + '</div><h3 class="kk-section">六项开发度</h3><div class="kk-organs">' + organHtml + '</div></div></section>';
  }

  function render(state) {
    if (!state) { root.innerHTML = '<div class="kk-empty">正在读取 MVU 状态数据…</div>'; return; }
    const relation = get(state, '姐妹关系', {});
    const dependence = number(get(relation, '依赖值', 0));
    const stage = Math.max(1, Math.min(4, Number(get(relation, '已解锁关系阶段', 1)) || 1));
    root.innerHTML = '<header class="kk-head"><div><p class="kk-eyebrow">伯爵府 · 私人账册</p><h1 class="kk-title">卡琳与卡娜｜状态档案</h1></div><p class="kk-note">MVU 实时状态</p></header><nav class="kk-tabs" role="tablist"><button class="kk-tab" data-tab="common" aria-selected="' + (active === 'common') + '">总览</button><button class="kk-tab" data-tab="karin" aria-selected="' + (active === 'karin') + '">卡琳</button><button class="kk-tab" data-tab="kana" aria-selected="' + (active === 'kana') + '">卡娜</button></nav><section class="kk-panel' + (active === 'common' ? ' active' : '') + '"><header class="kk-panel-head"><div><h2>庄园账册</h2><span>场景与共同状态</span></div><span>阶段不可逆</span></header><div class="kk-content"><div class="kk-grid">' + card('日期', get(state, '世界.日期', '—')) + card('时刻', get(state, '世界.时刻', '—')) + card('当前地点', get(state, '世界.地点', '—')) + card('管家位置', get(state, '管家.位置', '—')) + card('管家任务', get(state, '管家.当前任务', '—'), true) + '</div><h3 class="kk-section">姐妹依赖</h3><div class="kk-bar"><i style="width:' + dependence + '%"></i></div><div class="kk-stage"><span>' + phaseNames[stage - 1] + '（已解锁）</span><span>' + dependence + ' / 100</span></div></div></section>' + sisterPanel(state, '卡琳', 'karin') + sisterPanel(state, '卡娜', 'kana');
    root.querySelectorAll('.kk-tab').forEach((button) => button.addEventListener('click', () => { active = button.dataset.tab; render(state); }));
  }

  async function refresh() { render(await readState()); }
  refresh();
  let retries = 0;
  const timer = setInterval(async () => { await refresh(); retries += 1; if (retries >= 12) clearInterval(timer); }, 1200);
})();

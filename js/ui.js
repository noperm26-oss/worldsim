// ui.js — every panel, tab and readout. No simulation logic lives here; it reads the
// simulation and calls back into the actions it was given.

import { BIOMES, biomeIndex, biomeAt } from './biomes.js';
import { PRESETS } from './worldstate.js';
import { ERAS, TECHS, formatYear } from './eras.js';
import { POWERS, POWER_BY_ID, TRAITS, COMMANDMENTS, COVENANTS, TRAIT_COST, COMMANDMENT_COST } from './faith.js';
import { tierOf } from './sim.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const fmt = (n) => {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e4) return (n / 1e3).toFixed(1) + 'K';
  return Math.round(n).toLocaleString('en-US');
};

export function createUI(ctx) {
  const { world, sim, state, actions } = ctx;

  // ------------------------------------------------------------ tabs

  $$('#tabs button').forEach((b) => {
    b.addEventListener('click', () => {
      $$('#tabs button').forEach((x) => x.classList.toggle('on', x === b));
      $$('section[data-pane]').forEach((s) => {
        s.classList.toggle('on', s.dataset.pane === b.dataset.tab);
      });
      if (b.dataset.tab === 'peoples') renderPeoples();
    });
  });

  // ------------------------------------------------------------ world tab

  function buildPresets(into, big = false) {
    into.innerHTML = '';
    PRESETS.forEach((p) => {
      const btn = document.createElement('button');
      if (big) btn.className = 'preset-big';
      btn.innerHTML = `<span class="pname">${p.name}</span><span class="pblurb">${p.blurb}</span>`;
      btn.addEventListener('click', () => {
        actions.usePreset(p.id);
        if (!big) markActive($('#presets'), btn);
      });
      into.appendChild(btn);
    });
  }
  buildPresets($('#presets'));
  buildPresets($('#intro-presets'), true);

  $('#regen').addEventListener('click', () => {
    const on = $('#presets').querySelector('.on');
    const i = on ? [...$('#presets').children].indexOf(on) : -1;
    actions.usePreset(i >= 0 ? PRESETS[i].id : 'earth');
  });
  $('#clear').addEventListener('click', () => {
    actions.clearWorld();
    $$('#presets button').forEach((c) => c.classList.remove('on'));
  });

  const brushEl = $('#brush');
  brushEl.addEventListener('input', () => {
    state.brush = parseInt(brushEl.value, 10);
    $('#brush-val').textContent = state.brush;
  });

  const palette = $('#palette');
  BIOMES.forEach((b, i) => {
    const btn = document.createElement('button');
    btn.style.background = `rgb(${b.color.map((c) => Math.round(c * 255)).join(',')})`;
    btn.title = b.name;
    btn.addEventListener('click', () => selectBiome(i));
    palette.appendChild(btn);
  });

  function selectBiome(i) {
    state.biome = i;
    markActive(palette, palette.children[i]);
    const b = biomeAt(i);
    const info = b.cost < 90
      ? `fertility ${(b.fertility * 100) | 0}% · crossing ×${b.cost} · temp ${b.tempBias > 0 ? '+' : ''}${b.tempBias.toFixed(1)}`
      : 'impassable water — nothing can settle here';
    $('#biome-info').innerHTML = `<b style="color:#fff">${b.name}</b><br>${info}`;
  }
  selectBiome(biomeIndex('grassland'));

  // ------------------------------------------------------------ powers tab

  const powersEl = $('#powers');
  const KIND_LABEL = { creation: 'Creation', blessing: 'Blessing', destruction: 'Destruction' };
  for (const kind of ['creation', 'blessing', 'destruction']) {
    const h = document.createElement('h3');
    h.className = 'group';
    h.textContent = KIND_LABEL[kind];
    powersEl.appendChild(h);
    for (const p of POWERS.filter((x) => x.kind === kind)) {
      const btn = document.createElement('button');
      btn.className = 'power' + (p.kind === 'destruction' ? ' bad' : '');
      btn.innerHTML = `<span class="pname">${p.name}</span><span class="pcost">${p.cost} ✦</span>`;
      btn.addEventListener('click', () => {
        state.powerId = p.id;
        state.tool = 'power';
        setTool('power');
        markActive(powersEl, btn);
        $('#power-info').innerHTML = `<b style="color:#fff">${p.name}</b> — ${p.blurb}<br>
          <span style="color:var(--dim)">Cost ${p.cost} faith. Now click the planet.</span>`;
      });
      powersEl.appendChild(btn);
    }
  }

  // ------------------------------------------------------------ peoples tab

  function renderPeoples() {
    const list = $('#culture-list');
    const none = $('#no-people');
    none.hidden = sim.cultures.length > 0;
    list.innerHTML = '';

    const ranked = [...sim.cultures].map((c) => {
      const mine = sim.settlements.filter((s) => s.cultureId === c.id);
      return { c, pop: mine.reduce((a, s) => a + s.pop, 0), n: mine.length };
    }).sort((a, b) => b.pop - a.pop);

    for (const { c, pop, n } of ranked) {
      const btn = document.createElement('button');
      const era = ERAS[c.eraIndex];
      const swatch = `<span class="sw" style="background:#${c.color.toString(16).padStart(6, '0')}"></span>`;
      btn.innerHTML = `<span class="pname">${swatch}${c.name}</span>
        <span class="pblurb">${era.name} · ${fmt(pop)} people · ${n} settlement${n === 1 ? '' : 's'}</span>`;
      btn.addEventListener('click', () => { state.cultureId = c.id; renderPeoples(); });
      if (c.id === state.cultureId) btn.classList.add('on');
      list.appendChild(btn);
    }

    const c = state.cultureId ? sim.culture(state.cultureId) : (ranked[0] && ranked[0].c);
    if (!c) { $('#culture-detail').hidden = true; return; }
    state.cultureId = c.id;
    renderCulture(c);
  }

  function renderCulture(c) {
    const detail = $('#culture-detail');
    detail.hidden = false;
    const era = ERAS[c.eraIndex];
    const mine = sim.settlements.filter((s) => s.cultureId === c.id);
    const pop = mine.reduce((a, s) => a + s.pop, 0);
    const next = ERAS[c.eraIndex + 1];

    $('#cd-name').innerHTML =
      `<span class="sw" style="background:#${c.color.toString(16).padStart(6, '0')}"></span> ${c.name}`;
    $('#cd-summary').innerHTML =
      `<b style="color:#fff">${era.name}</b> · ${fmt(pop)} people in ${mine.length} settlement${mine.length === 1 ? '' : 's'}<br>`
      + (next
        ? `Next: <b>${next.name}</b> — needs ${fmt(next.minPop)} people${next.req.length ? ' and ' + next.req.map((t) => TECHS[t].name).join(', ') : ''}.`
        : 'At the end of the ladder.');

    // traits
    const tt = $('#cd-traits');
    tt.innerHTML = '<h2>Traits</h2>';
    const have = Object.keys(c.traits).filter((t) => TRAITS[t]);
    const wrap = document.createElement('div');
    wrap.className = 'chips';
    if (have.length) {
      for (const t of have) {
        const s = document.createElement('span');
        s.className = 'chip on';
        s.textContent = TRAITS[t].name;
        wrap.appendChild(s);
      }
    }
    for (const t of Object.keys(TRAITS)) {
      if (c.traits[t]) continue;
      const b = document.createElement('button');
      b.className = 'chip';
      b.textContent = `+ ${TRAITS[t].name} (${TRAIT_COST}✦)`;
      b.addEventListener('click', () => {
        const r = actions.grantTrait(c.id, t);
        if (!r.ok) toast(r.why); else renderPeoples();
      });
      wrap.appendChild(b);
    }
    tt.appendChild(wrap);

    // commandments
    const cc = $('#cd-commandments');
    cc.innerHTML = '';
    const cw = document.createElement('div');
    cw.className = 'chips';
    c.commandments = c.commandments || [];
    for (const cmd of COMMANDMENTS) {
      const has = c.commandments.includes(cmd.id);
      const el = document.createElement(has ? 'span' : 'button');
      el.className = 'chip' + (has ? ' on' : '');
      el.textContent = has ? `✓ ${cmd.name}` : `+ ${cmd.name} (${COMMANDMENT_COST}✦)`;
      if (!has) el.addEventListener('click', () => {
        const r = actions.giveCommandment(c.id, cmd.id);
        if (!r.ok) toast(r.why); else renderPeoples();
      });
      cw.appendChild(el);
    }
    cc.appendChild(cw);

    // covenant
    const cv = $('#cd-covenant');
    cv.innerHTML = '';
    if (c.covenant) {
      const p = document.createElement('p');
      p.className = 'hint';
      const cov = COVENANTS.find((x) => x.id === c.covenant);
      p.innerHTML = `<b style="color:var(--accent-2)">${cov.name}</b> — ${cov.blurb}`;
      cv.appendChild(p);
    } else {
      const cw2 = document.createElement('div');
      cw2.className = 'chips';
      for (const cov of COVENANTS) {
        const b = document.createElement('button');
        b.className = 'chip';
        b.textContent = `${cov.name} (${cov.cost}✦)`;
        b.title = cov.blurb;
        b.addEventListener('click', () => {
          const r = actions.sealCovenant(c.id, cov.id);
          if (!r.ok) toast(r.why); else renderPeoples();
        });
        cw2.appendChild(b);
      }
      cv.appendChild(cw2);
    }

    // settlements
    const st = $('#cd-settlements');
    st.innerHTML = '';
    const rows = [...mine].sort((a, b) => b.pop - a.pop).slice(0, 12);
    for (const s of rows) {
      const d = document.createElement('button');
      d.className = 'settle';
      const flags = [s.plague > 0 ? '☣ plague' : '', s.drought > 0 ? '☀ drought' : '', s.warWith ? '⚔ war' : '']
        .filter(Boolean).join(' · ');
      d.innerHTML = `<span class="pname">${s.name}</span>
        <span class="pblurb">${tierOf(s.pop).name} · ${fmt(s.pop)}${flags ? ' · <i>' + flags + '</i>' : ''}</span>`;
      d.addEventListener('click', () => actions.focusSettlement(s));
      st.appendChild(d);
    }

    $('#cd-techs').textContent = c.techs.size
      ? [...c.techs].map((t) => TECHS[t] ? TECHS[t].name : t).join(' · ')
      : 'Nothing yet.';
  }

  // ------------------------------------------------------------ save tab

  $('#save-btn').addEventListener('click', () => {
    const at = actions.save();
    $('#save-info').textContent = `Saved at ${new Date(at).toLocaleTimeString()}.`;
  });
  $('#load-btn').addEventListener('click', () => {
    if (actions.load()) $('#save-info').textContent = 'World loaded.';
    else $('#save-info').textContent = 'No saved world in this browser.';
  });
  $('#export-btn').addEventListener('click', () => actions.export());
  $('#import-file').addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (!f) return;
    actions.import(f).then(
      () => { $('#save-info').textContent = `Imported ${f.name}.`; },
      (err) => { $('#save-info').textContent = `Import failed: ${err.message}`; }
    );
    e.target.value = '';
  });
  $('#wipe-btn').addEventListener('click', () => {
    if (confirm('Destroy this world and begin again with clear water?')) actions.wipe();
  });

  const ladder = $('#era-ladder');
  ERAS.forEach((e) => {
    const d = document.createElement('div');
    d.className = 'era-row';
    d.innerHTML = `<span class="en">${e.name}</span>
      <span class="ey">${formatYear(e.from)} → ${e.to > 9000 ? '…' : formatYear(e.to)}</span>`;
    d.title = e.blurb;
    ladder.appendChild(d);
  });

  // ------------------------------------------------------------ toolbar

  function setTool(t) {
    state.tool = t;
    $$('#toolbar .tools button').forEach((b) => b.classList.toggle('on', b.dataset.tool === t));
  }
  $$('#toolbar .tools button').forEach((b) => {
    b.addEventListener('click', () => setTool(b.dataset.tool));
  });
  $$('#toolbar .speeds button').forEach((b) => {
    b.addEventListener('click', () => {
      state.speed = parseFloat(b.dataset.speed);
      $$('#toolbar .speeds button').forEach((x) => x.classList.toggle('on', x === b));
    });
  });

  // ------------------------------------------------------------ intro

  $('#intro-water').addEventListener('click', () => {
    actions.closeIntro();
  });
  $$('#intro-presets button').forEach((b) => {
    b.addEventListener('click', () => actions.closeIntro(), { once: true });
  });

  // ------------------------------------------------------------ per-frame readouts

  let lastLogLen = -1;

  function refresh() {
    $('#date-readout').textContent = formatYear(sim.year);
    $('#r-pop').textContent = fmt(sim.population);
    $('#r-faith').textContent = Math.floor(sim.faith).toLocaleString('en-US');
    $('#r-cultures').textContent = sim.cultures.length;
    $('#r-era').textContent = sim.cultures.length
      ? ERAS[Math.max(...sim.cultures.map((c) => c.eraIndex))].name
      : '—';

    if (sim.log.length !== lastLogLen) {
      lastLogLen = sim.log.length;
      const log = $('#log');
      log.innerHTML = '';
      for (const e of sim.log.slice(0, 40)) {
        const d = document.createElement('div');
        d.className = 'log-row';
        d.innerHTML = `<span class="ly">${formatYear(e.year)}</span><span class="lm">${e.msg}</span>`;
        log.appendChild(d);
      }
    }

    renderPrayers();
    if ($('#peoples').querySelector) { /* no-op guard */ }
    if ($('section[data-pane="peoples"]').classList.contains('on')) renderPeoples();
  }

  function renderPrayers() {
    const box = $('#prayer-list');
    const badge = $('#prayer-count');
    badge.hidden = sim.prayers.length === 0;
    badge.textContent = sim.prayers.length;
    if (!sim.prayers.length) {
      if (!box.dataset.empty) {
        box.innerHTML = '<p class="hint">No prayers are waiting.</p>';
        box.dataset.empty = '1';
      }
      return;
    }
    delete box.dataset.empty;
    box.innerHTML = '';
    for (const p of sim.prayers) {
      const d = document.createElement('div');
      d.className = 'prayer';
      d.innerHTML = `<p class="ptext">“${p.text}”</p>
        <p class="pwho">${p.settlementName} of ${p.cultureName} · ${formatYear(p.raised)}</p>
        <div class="prow">
          <button class="yes">Answer · 60✦</button>
          <button class="no">Refuse</button>
        </div>`;
      d.querySelector('.yes').addEventListener('click', () => {
        const r = actions.answerPrayer(p.id);
        if (!r.ok) toast(r.why);
      });
      d.querySelector('.no').addEventListener('click', () => actions.refusePrayer(p.id));
      box.appendChild(d);
    }
  }

  // ------------------------------------------------------------ cursor + toast

  function cursor(text) {
    const el = $('#cursor-info');
    el.textContent = text || '';
    el.hidden = !text;
  }

  let toastTimer = null;
  function toast(msg) {
    const el = $('#cursor-info');
    el.textContent = msg;
    el.hidden = false;
    el.classList.add('warn');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('warn'), 2200);
  }

  return { refresh, cursor, toast, setTool, selectBiome, renderPeoples };
}

export function markActive(container, btn) {
  for (const c of container.children) if (c.classList) c.classList.remove('on');
  if (btn) btn.classList.add('on');
}

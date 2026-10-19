// V88.8 read-only six-panel presentation of the authenticated monitor event bus.
(() => {
  'use strict';
  const fixtureMode = new URLSearchParams(location.search).get('fixture') === '1';
  const events = new Map();
  const runs = new Map();
  const attempts = new Set();
  let openaiUsage = null;
  const failures = new Set(['failure', 'cancelled', 'timed_out']);
  const terminal = new Set(['completed', 'success', ...failures, 'skipped', 'neutral', 'action_required', 'stale']);
  const $ = selector => document.querySelector(selector);
  const serviceIcon = (id, kind) => window.__NG_ICONS?.icon(id, kind) || '';
  const safe = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
  const timeLabel = value => new Date(value).toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false});
  const status = () => fixtureMode ? 'fixture' : ($('#v71-state')?.dataset.state === 'connected' ? 'live' : 'offline');

  function normalize(event) {
    const meta = event?.metadata || {};
    const repository = String(meta.repository || '');
    const runId = String(meta.runId || '');
    const timestamp = Date.parse(event?.timestamp || '');
    if (event?.schema !== 'neural-grid/event/v1' || event.source !== 'github' ||
        !String(event.type || '').startsWith('github.workflow.') ||
        typeof event.eventId !== 'string' || !/^[A-Za-z0-9-]{8,80}$/.test(event.eventId) ||
        !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) ||
        !/^[0-9]{1,24}$/.test(runId) || !Number.isFinite(timestamp)) return null;
    const rawAttempt = meta.attempt ?? meta.runAttempt;
    const attempt = Number.isInteger(Number(rawAttempt)) && Number(rawAttempt) > 0 ? Number(rawAttempt) : null;
    return {
      id: event.eventId, repository, runId, attempt, timestamp,
      workflow: String(meta.workflow || 'Workflow'),
      phase: String(meta.status || '').toLowerCase(),
      conclusion: String(meta.conclusion || '').toLowerCase()
    };
  }

  function ingest(raw) {
    const event = normalize(raw);
    if (!event || events.has(event.id)) return false;
    events.set(event.id, event);
    const key = event.repository + '#' + event.runId;
    if (event.attempt !== null) attempts.add(key + '#' + event.attempt);
    const previous = runs.get(key);
    if (!previous || event.timestamp >= previous.timestamp) {
      const done = event.phase === 'completed' || terminal.has(event.conclusion);
      runs.set(key, {...event, done, conclusion: done ? (event.conclusion || 'completed') : ''});
    }
    render();
    return true;
  }

  function renderChart(chronology) {
    const line = $('#v88-flow-line');
    const dots = $('#v88-flow-points');
    if (!line || !dots) return;
    const first = chronology[0]?.timestamp || Date.now();
    const last = chronology.at(-1)?.timestamp || first;
    const span = Math.max(1000, last - first);
    const coords = chronology.map((event, i) => ({
      x: 28 + ((event.timestamp - first) / span) * 282,
      y: 92 - ((i + 1) / Math.max(chronology.length, 1)) * 74,
      event
    }));
    line.setAttribute('points', coords.length ?
      '28,92 ' + coords.map(p => p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ') :
      '28,92 310,92');
    dots.replaceChildren(...coords.map(point => {
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', point.x.toFixed(1));
      circle.setAttribute('cy', point.y.toFixed(1));
      circle.setAttribute('r', '4');
      circle.setAttribute('aria-label', timeLabel(point.event.timestamp) + ' ' + point.event.phase);
      const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      title.textContent = timeLabel(point.event.timestamp) + ' · GitHub ' + (point.event.conclusion || point.event.phase) + ' · run #' + point.event.runId;
      circle.append(title);
      return circle;
    }));
    $('#v88-flow-start').textContent = coords.length ? timeLabel(first) : 'NO EVENTS';
    $('#v88-flow-end').textContent = coords.length ? timeLabel(last) : '';
  }

  function render() {
    const mode = status();
    const label = $('#v70-activity .live-label');
    if (label) {
      label.dataset.state = mode;
      label.textContent = mode === 'fixture' ? '◆ FIXTURE' : mode === 'live' ? '● LIVE' : '○ OFFLINE';
    }
    const all = [...runs.values()];
    const active = all.filter(run => !run.done);
    const completed = all.filter(run => run.done && !failures.has(run.conclusion));
    const failed = all.filter(run => run.done && failures.has(run.conclusion));
    const chronology = [...events.values()].sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));
    const system = $('#v70-system .v70-data');
    if (system) {
      const gateway = mode === 'live' ? 'CONNECTED' : mode === 'fixture' ? 'FIXTURE' : 'OFFLINE';
      const rows = [
        ['GATEWAY', gateway, mode === 'live' ? 'good' : 'muted'],
        ['EXECUTION MODE', 'DISABLED', 'good'],
        ['VIEWER SESSION', mode === 'live' ? 'CONNECTED' : 'DISCONNECTED', mode === 'live' ? 'good' : 'muted'],
        ['ACTIVE WORKFLOWS', active.length, active.length ? 'blue' : 'muted'],
        ['UNIQUE RUNS', all.length, ''],
        ['COMPLETED HISTORY', completed.length, 'good'],
        ['FAILED HISTORY', failed.length, failed.length ? 'bad' : ''],
        ['TELEMETRY EVENTS', events.size, 'blue']
      ];
      system.innerHTML = '<div class="status-table">' + rows.map(([name, value, tone]) =>
        '<div class="status-row"><span>' + name + '</span><strong class="' + tone + '">' + value + '</strong></div>').join('') +
        '</div><div class="system-foot">Current active · historical outcomes · unique event IDs</div>';
    }
    const feed = $('#v88-activity-feed');
    if (feed) feed.innerHTML = chronology.slice(-20).reverse().map(event => {
      const failedEvent = failures.has(event.conclusion);
      const dot = failedEvent ? 'failed' : event.phase === 'completed' ? 'done' : 'active';
      const state = event.conclusion || event.phase || 'observed';
      return '<article class="activity-item" title="' + safe(event.repository) + ' · run #' + safe(event.runId) + '"><time>' + timeLabel(event.timestamp) +
        '</time><span class="status-dot ' + dot + '"></span><span class="activity-icon" aria-hidden="true">' + serviceIcon('github','service-icon') + '</span><div><b>GITHUB</b><span class="activity-description">' +
        safe(event.workflow) + '</span><small>' + safe(state).replaceAll('_',' ') + ' · run #' +
        safe(event.runId) + '</small></div></article>';
    }).join('') || '<div class="empty">No authenticated telemetry received</div>';
    if(feed&&openaiUsage?.verified){
      const snapshot=document.createElement('aside');snapshot.id='v88-openai-usage';snapshot.setAttribute('role','status');
      snapshot.className='openai-usage-snapshot';
      const title=document.createElement('b');title.textContent='OPENAI API · VERIFIED READ ONLY';snapshot.append(title);
      const details=document.createElement('small');
      const records=openaiUsage.usage.status==='available'?openaiUsage.usage.records:[];
      if(records.length){
        const sum=field=>{const values=records.map(row=>row[field]).filter(Number.isSafeInteger);return values.length?values.reduce((a,b)=>a+b,0):null;};
        const models=[...new Set(records.map(row=>row.model).filter(Boolean))];
        details.textContent='Provider-reported daily aggregate · '+(sum('requests')??'—')+' model requests · '+
          (sum('inputTokens')??'—')+' input / '+(sum('outputTokens')??'—')+' output tokens'+
          (models.length?' · '+models.slice(0,3).join(', '):'');
      }else if(openaiUsage.usage.status==='available'){
        details.textContent='API verified; no model usage rows returned for the current UTC-day bucket.';
      }else if(openaiUsage.usage.status==='not_configured'){
        details.textContent='API verified; organization Usage Read is not configured.';
      }else{
        details.textContent='API verified; provider usage unavailable ('+openaiUsage.usage.status+').';
      }
      snapshot.append(details);feed.append(snapshot);
    }
    renderChart(chronology);
    const flow = $('#v70-flow .v70-data');
    if (flow) flow.innerHTML = '<div class="flow-summary"><span class="flow-legend"><i></i> GITHUB <b>' + events.size +
      '</b></span><span>Time → · cumulative events ↑</span></div>';
    const metrics = $('#v70-metrics .v70-data');
    if (metrics) metrics.innerHTML = '<div class="station-table"><div class="station-header"><span>STATION</span><span>CPU</span><span>MEM</span><span>EVENTS</span></div>' +
      [['github','GITHUB',events.size,active.length?'active':'idle'],['render','RENDER',0,'muted'],['netlify','NETLIFY',0,'muted'],['chatgpt','OPENAI API',0,'muted'],['higgsfield','HIGGSFIELD',0,'muted']]
        .map(([id,name,count,state]) => '<div class="station-row ' + state + '"><span><i></i>' + serviceIcon(id,'service-icon') + name + '</span><span>—</span><span>—</span><strong>' + count + '</strong></div>').join('') +
      '</div><div class="station-history">GitHub ' + (active.length ? active.length+' active' : 'idle') +
      ' · completed history ' + completed.length + ' · failed history ' + failed.length + '</div>'+
      (openaiUsage?.verified?'<div class="station-history" title="Provider-reported daily aggregate; not a live event count">OpenAI API · '+
        (openaiUsage.usage.status==='available'?'daily aggregate · '+openaiUsage.usage.records.length+' model rows':'usage unavailable')+
        ' · no ChatGPT account telemetry</div>':'');
    const map = $('#v70-map .v70-data');
    if (map) map.innerHTML = '<div class="route-note"><b>' +
      (mode === 'live' ? '● VERIFIED SESSION' : mode === 'fixture' ? '◆ FIXTURE · NOT LIVE' : '○ CONFIGURED · OFFLINE') +
      '</b><span>GitHub webhook → staging gateway → read-only viewer</span><small>Viewer ' +
      (mode === 'live' ? 'authenticated' : 'disconnected') + ' · OpenAI '+
      (openaiUsage?.verified?'verified · read only':'unverified')+'</small></div>';
    const graphic = $('#v70-map .connection-map');
    if (graphic) graphic.dataset.state = mode === 'live' && events.size ? 'verified' : mode;
    const station = $('#stations button[data-id="github"]');
    if (station) {
      station.classList.toggle('station-active', active.length > 0);
      station.setAttribute('aria-label', 'GitHub station · ' + active.length + ' active workflows');
    }
  }

  document.addEventListener('ng:monitor-event', event => ingest(event.detail));
  document.addEventListener('ng:openai-usage',event=>{openaiUsage=event.detail||null;render();});
  document.addEventListener('ng:monitor-reset', () => {
    events.clear(); runs.clear(); attempts.clear(); openaiUsage=null; render();
  });
  const monitor = $('#v71-state');
  if (monitor) new MutationObserver(render).observe(monitor, {attributes: true, attributeFilter: ['data-state']});
  window.__ngV88LiveDashboard = {
    snapshot: () => ({runs: [...runs.values()], events: [...events.values()], eventCount: events.size,openaiUsage}),
    ingest
  };
  render();
  if (fixtureMode) {
    const states = [['in_progress', ''], ['in_progress', ''], ['completed', 'success'], ['completed', 'success']];
    const now = Date.now();
    const fixture = states.map(([phase, conclusion], index) => ({
      schema: 'neural-grid/event/v1', source: 'github', type: 'github.workflow.' + phase,
      eventId: 'fixture-' + index + '-39104865785',
      timestamp: new Date(now - (3 - index) * 90000).toISOString(),
      metadata: {
        repository: 'Byratino01/neural-grid-gateway', runId: '39104865785',
        workflow: 'Gateway safety tests', status: phase, conclusion
      }
    }));
    const note = document.createElement('div');
    note.id = 'v88-fixture-note';
    note.textContent = 'FIXTURE PREVIEW · NOT LIVE TELEMETRY';
    $('#v70-activity .panel-body').prepend(note);
    fixture.forEach(ingest);
  }
})();

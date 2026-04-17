// ==================== CANVAS & DRAWING ====================
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
  const statusBar = document.getElementById('status-bar');
  const canvasSection = document.getElementById('canvas-section');
  
  // Get actual canvas container dimensions
  const rect = canvasSection.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
}
resizeCanvas();
window.addEventListener('resize', () => {
  setTimeout(resizeCanvas, 10);  // Slight delay to ensure layout has updated
});

let isDrawing = false;
let currentStroke = [];
let currentColor = '#7c83fd';
let brushSize = 4;
let isEraser = false;
const strokes = []; 
let undoStack = [];
let redoStack = [];

// ==================== UNDO / REDO ====================
function updateUndoRedoButtons() {
  document.getElementById('undo-btn').disabled = undoStack.length === 0;
  document.getElementById('redo-btn').disabled = redoStack.length === 0;
}

function undo() {
  if (undoStack.length === 0) return;
  const removedStroke = strokes.pop();
  undoStack.pop();
  redoStack.push(removedStroke);
  replayAll(strokes);
  updateUndoRedoButtons();
  addEventLog('↶ Local Undo', 'success');
}

function redo() {
  if (redoStack.length === 0) return;
  const redoStroke = redoStack.pop();
  strokes.push(redoStroke);
  undoStack.push(redoStroke);
  replayAll(strokes);
  updateUndoRedoButtons();
  addEventLog('↷ Local Redo', 'success');
}

document.getElementById('undo-btn').addEventListener('click', undo);
document.getElementById('redo-btn').addEventListener('click', redo);

// ==================== COLOR & BRUSH CONTROLS ====================
document.querySelectorAll('.color-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    if (btn.dataset.color === 'eraser') {
      isEraser = true;
    } else {
      isEraser = false;
      currentColor = btn.dataset.color;
    }
  });
});
document.getElementById('brush-size').addEventListener('input', e => {
  brushSize = parseInt(e.target.value);
});

// ==================== DRAWING FUNCTIONS ====================
function getPos(e) {
  const rect = canvas.getBoundingClientRect();
  if (e.touches) {
    return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
  }
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function renderStroke(stroke) {
  if (!stroke.points || stroke.points.length < 2) return;
  ctx.beginPath();
  ctx.globalCompositeOperation = stroke.isEraser ? 'destination-out' : 'source-over';
  ctx.strokeStyle = stroke.isEraser ? 'rgba(0,0,0,1)' : stroke.color;
  ctx.lineWidth = stroke.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
  for (let i = 1; i < stroke.points.length; i++) {
    ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
  }
  ctx.stroke();
}

function replayAll(strokeList) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  strokeList.forEach(renderStroke);
}

canvas.addEventListener('mousedown', e => {
  isDrawing = true;
  currentStroke = [getPos(e)];
});
canvas.addEventListener('mousemove', e => {
  if (!isDrawing) return;
  const pos = getPos(e);
  currentStroke.push(pos);
  if (currentStroke.length >= 2) {
    ctx.beginPath();
    ctx.globalCompositeOperation = isEraser ? 'destination-out' : 'source-over';
    ctx.strokeStyle = isEraser ? 'rgba(0,0,0,1)' : currentColor;
    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const prev = currentStroke[currentStroke.length - 2];
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  }
});
canvas.addEventListener('mouseup', sendStroke);
canvas.addEventListener('mouseleave', sendStroke);

canvas.addEventListener('touchstart', e => { e.preventDefault(); isDrawing = true; currentStroke = [getPos(e)]; }, { passive: false });
canvas.addEventListener('touchmove', e => { e.preventDefault(); if (!isDrawing) return; currentStroke.push(getPos(e)); }, { passive: false });
canvas.addEventListener('touchend', e => { e.preventDefault(); sendStroke(); }, { passive: false });

function sendStroke() {
  if (!isDrawing || currentStroke.length < 2) { isDrawing = false; currentStroke = []; return; }
  isDrawing = false;
  const stroke = {
    type: 'stroke',
    id: crypto.randomUUID(),
    points: currentStroke,
    color: currentColor,
    width: brushSize,
    isEraser: isEraser
  };
  currentStroke = [];
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(stroke));
  }
}

// ==================== WEBSOCKET & CONNECTION ====================
let ws = null;
let reconnectDelay = 1000;
const maxDelay = 10000;
let connectionState = 'disconnected';  // Track connection state globally
const systemEvents = [];
const MAX_EVENTS = 100;

function addEventLog(message, type = 'info', details = '') {
  const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
  systemEvents.push({ timestamp, message, type, details });
  if (systemEvents.length > MAX_EVENTS) systemEvents.shift();
  updateEventLog();
}

function updateEventLog() {
  const eventsLog = document.getElementById('events-log');
  eventsLog.innerHTML = systemEvents.map(evt => `
    <div class="log-entry">
      <span class="log-time">${evt.timestamp}</span>
      <span class="log-event ${evt.type}">${evt.message}</span>
      ${evt.details ? `<div style="margin-top:2px; color:#7c83fd; font-size:9px;">${evt.details}</div>` : ''}
    </div>
  `).join('');
  eventsLog.scrollTop = eventsLog.scrollHeight;
}

function connect() {
  updateStatus('reconnecting');
  const wsUrl = `ws://${window.location.host}`;
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    connectionState = 'connected';
    updateStatus('connected');
    reconnectDelay = 1000;
    addEventLog('🔗 Connected to Gateway', 'success');
    document.getElementById('status-conn').textContent = '✅ Connected';
    console.log('[WS] Connected to gateway');
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'stroke') {
      strokes.push(msg.stroke);
      renderStroke(msg.stroke);
      redoStack = [];
      undoStack.push(msg.stroke);
      updateUndoRedoButtons();
      document.getElementById('log-display').textContent = strokes.length;
      document.getElementById('status-strokes').textContent = strokes.length;
    } else if (msg.type === 'replay') {
      strokes.length = 0;
      undoStack = [];
      redoStack = [];
      strokes.push(...msg.strokes);
      replayAll(strokes);
      undoStack = [...msg.strokes];
      updateUndoRedoButtons();
      document.getElementById('log-display').textContent = strokes.length;
      document.getElementById('status-strokes').textContent = strokes.length;
      addEventLog('🔄 Full Log Replay', 'info', `${msg.strokes.length} strokes loaded`);
    } else if (msg.type === 'leader-info') {
      document.getElementById('leader-display').textContent = msg.leaderId || 'unknown';
      document.getElementById('term-display').textContent = msg.term || '—';
      document.getElementById('status-leader').textContent = msg.leaderId || 'Unknown';
      document.getElementById('status-term').textContent = msg.term || '0';
    } else if (msg.type === 'event') {
      addEventLog(msg.message, msg.severity, msg.details);
    } else if (msg.type === 'replicas-status') {
      updateReplicasInfo(msg.replicas);
    }
  };

  ws.onclose = () => {
    connectionState = 'disconnected';
    updateStatus('disconnected');
    document.getElementById('status-conn').textContent = '❌ Disconnected';
    addEventLog('⚠️ Disconnected from Gateway', 'failure', `Retrying in ${reconnectDelay}ms`);
    console.log(`[WS] Disconnected. Reconnecting in ${reconnectDelay}ms`);
    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, maxDelay);
  };

  ws.onerror = () => ws.close();
}

function updateStatus(statusState) {
  const dot = document.getElementById('conn-dot');
  const label = document.getElementById('conn-status');
  dot.className = 'status-dot';
  if (statusState === 'connected') { dot.classList.add('dot-connected'); label.textContent = 'Connected'; }
  else if (statusState === 'reconnecting') { dot.classList.add('dot-reconnecting'); label.textContent = 'Reconnecting...'; }
  else { dot.classList.add('dot-disconnected'); label.textContent = 'Disconnected'; }
}

async function pollLeaderInfo() {
  try {
    const res = await fetch(`http://${window.location.host}/leader-status`);
    const data = await res.json();
    document.getElementById('leader-display').textContent = data.leaderId || 'electing...';
    document.getElementById('term-display').textContent = data.term || '—';
    document.getElementById('status-leader').textContent = data.leaderId || 'Unknown';
    document.getElementById('status-term').textContent = data.term || '0';
  } catch (_) {}
}
setInterval(pollLeaderInfo, 1000);

// ==================== REPLICAS STATUS ====================
let replicasCache = {};

function updateReplicasInfo(replicas) {
  replicasCache = replicas || {};
  const replicasDiv = document.getElementById('replicas-info');
  if (!replicas || Object.keys(replicas).length === 0) {
    replicasDiv.innerHTML = '<div style="color:#f87171;">No replica info available</div>';
    return;
  }
  replicasDiv.innerHTML = Object.entries(replicas).map(([id, info]) => `
    <div class="status-item">
      <div class="status-label">🖥️ ${id}</div>
      <div style="font-size:10px; margin-top:4px;">
        <div>Role: <span style="color:#4ade80;">${info.role || 'unknown'}</span></div>
        <div>Term: <span style="color:#fbbf24;">${info.term || 0}</span></div>
        <div>Log: <span style="color:#7c83fd;">${info.logLength || 0}</span> entries</div>
        <div>Commit: <span style="color:#a8b2d8;">${info.commitIndex || -1}</span></div>
      </div>
    </div>
  `).join('');
}

// ==================== DASHBOARD TABS ====================
document.querySelectorAll('.dashboard-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const tabName = tab.dataset.tab;
    document.querySelectorAll('.dashboard-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.dashboard-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`${tabName}-tab`).classList.add('active');
  });
});

document.getElementById('clear-logs-btn').addEventListener('click', () => {
  systemEvents.length = 0;
  updateEventLog();
  addEventLog('🗑️ Logs Cleared', 'success');
});

// ==================== PERIODIC STATUS UPDATES ====================
setInterval(() => {
  document.getElementById('status-log').textContent = strokes.length;
  document.getElementById('status-strokes').textContent = strokes.length;
  document.getElementById('log-display').textContent = strokes.length;
}, 1000);

document.getElementById('kill-leader-btn').addEventListener('click', async () => {
  try {
    const btn = document.getElementById('kill-leader-btn');
    btn.textContent = 'Killing Leader...';
    btn.style.opacity = '0.5';
    await fetch(`http://${window.location.host}/kill-leader`, { method: 'POST' });
    addEventLog('💥 Leader Crash Triggered', 'failure');
    setTimeout(() => { btn.textContent = 'Simulate Leader Failure'; btn.style.opacity = '1'; }, 2000);
  } catch(e) {
    addEventLog('❌ Failed to trigger leader crash', 'failure');
  }
});

connect();

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
  const statusBar = document.getElementById('status-bar');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight - statusBar.offsetHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

let isDrawing = false;
let currentStroke = [];
let currentColor = '#7c83fd';
let brushSize = 4;
const strokes = []; 

document.querySelectorAll('.color-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentColor = btn.dataset.color;
  });
});
document.getElementById('brush-size').addEventListener('input', e => {
  brushSize = parseInt(e.target.value);
});

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
  ctx.strokeStyle = stroke.color;
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
    ctx.strokeStyle = currentColor;
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
    width: brushSize
  };
  currentStroke = [];
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(stroke));
  }
}

let ws = null;
let reconnectDelay = 1000;
const maxDelay = 10000;

function connect() {
  updateStatus('reconnecting');
  const wsUrl = `ws://${window.location.host}`; // Auto-detect host based on serving port, usually 8080
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    updateStatus('connected');
    reconnectDelay = 1000;
    console.log('[WS] Connected to gateway');
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'stroke') {
      strokes.push(msg.stroke);
      renderStroke(msg.stroke);
      document.getElementById('log-display').textContent = strokes.length;
    } else if (msg.type === 'replay') {
      strokes.length = 0;
      strokes.push(...msg.strokes);
      replayAll(strokes);
      document.getElementById('log-display').textContent = strokes.length;
    } else if (msg.type === 'leader-info') {
      document.getElementById('leader-display').textContent = msg.leaderId || 'unknown';
      document.getElementById('term-display').textContent = msg.term || '—';
    }
  };

  ws.onclose = () => {
    updateStatus('disconnected');
    console.log(`[WS] Disconnected. Reconnecting in ${reconnectDelay}ms`);
    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, maxDelay);
  };

  ws.onerror = () => ws.close();
}

function updateStatus(state) {
  const dot = document.getElementById('conn-dot');
  const label = document.getElementById('conn-status');
  dot.className = 'status-dot';
  if (state === 'connected') { dot.classList.add('dot-connected'); label.textContent = 'Connected'; }
  else if (state === 'reconnecting') { dot.classList.add('dot-reconnecting'); label.textContent = 'Reconnecting...'; }
  else { dot.classList.add('dot-disconnected'); label.textContent = 'Disconnected'; }
}

async function pollLeaderInfo() {
  try {
    const res = await fetch(`http://${window.location.host}/leader-status`);
    const data = await res.json();
    document.getElementById('leader-display').textContent = data.leaderId || 'electing...';
    document.getElementById('term-display').textContent = data.term || '—';
  } catch (_) {}
}
setInterval(pollLeaderInfo, 2000);

connect();

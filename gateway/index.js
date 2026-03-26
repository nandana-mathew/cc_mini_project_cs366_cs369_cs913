const express = require('express');
const { WebSocketServer } = require('ws');
const fetch = require('node-fetch');
const http = require('http');
const path = require('path');

const app = express();
app.use(express.json());
// Serve frontend directly using absolute paths available inside Gateway Docker container
app.use(express.static(path.join(__dirname, 'frontend')));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const state = {
  clients: new Set(),         // connected WebSocket clients
  leaderUrl: null,            // current leader's base URL
  replicaUrls: process.env.REPLICA_URLS ? process.env.REPLICA_URLS.split(',') : [],
  committedLog: []            // in-memory log for reconnecting clients
};

wss.on('connection', (ws) => {
  state.clients.add(ws);
  console.log(`[GATEWAY] Client connected. Total: ${state.clients.size}`);

  if (state.committedLog.length > 0) {
    ws.send(JSON.stringify({ type: 'replay', strokes: state.committedLog }));
  }

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw);
      if (msg.type === 'stroke') {
        await forwardStrokeToLeader(msg);
      }
    } catch (e) { console.error('[GATEWAY] Message error:', e); }
  });

  ws.on('close', () => {
    state.clients.delete(ws);
    console.log(`[GATEWAY] Client disconnected. Total: ${state.clients.size}`);
  });
});

async function forwardStrokeToLeader(stroke) {
  if (!state.leaderUrl) {
    console.error('[GATEWAY] No leader known yet, dropping stroke');
    return;
  }
  try {
    const res = await fetch(`${state.leaderUrl}/stroke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(stroke)
    });
    // Check if leader redirected
    if (res.status === 307) {
        const body = await res.json();
        const newLeaderId = body.redirect;
        if (newLeaderId) {
            console.log(`[GATEWAY] Leader redirect received: ${newLeaderId}`);
            // attempt redsicover immediately or let polling do it
            await discoverLeader();
        }
    }
  } catch (e) {
    console.error('[GATEWAY] Failed to reach leader, triggering rediscovery', e.message);
    state.leaderUrl = null;
    await discoverLeader();
  }
}

async function discoverLeader() {
  for (const url of state.replicaUrls) {
    try {
      const res = await fetch(`${url}/status`, { timeout: 1000 });
      const data = await res.json();
      if (data.role === 'leader') {
        if (state.leaderUrl !== url) {
          console.log(`[GATEWAY] New leader discovered: ${url} (term ${data.term})`);
        }
        state.leaderUrl = url;
        return;
      }
    } catch (_) {}
  }
}
setInterval(discoverLeader, 500);

app.post('/committed', (req, res) => {
  const { stroke } = req.body;
  state.committedLog.push(stroke);
  broadcast({ type: 'stroke', stroke });
  res.json({ success: true });
});

app.post('/leader-update', (req, res) => {
  const { leaderId, leaderUrl } = req.body;
  console.log(`[GATEWAY] Leader update received: ${leaderId} at ${leaderUrl}`);
  state.leaderUrl = leaderUrl;
  res.json({ success: true });
});

app.get('/log', (req, res) => {
  res.json({ strokes: state.committedLog });
});

app.get('/leader-status', (req, res) => {
  const leader = state.replicaUrls.find(u => u === state.leaderUrl);
  res.json({ 
    leaderUrl: state.leaderUrl,
    leaderId: state.leaderUrl ? state.leaderUrl.split('//')[1].split(':')[0] : null,
    term: null // Gateway doesn't track term; frontend can get from /status directly
  });
});

function broadcast(msg) {
  const data = JSON.stringify(msg);
  state.clients.forEach(client => {
    if (client.readyState === 1) client.send(data);
  });
}

server.listen(8080, () => console.log('[GATEWAY] Listening on :8080'));

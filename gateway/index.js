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
  committedLog: [],           // in-memory log for reconnecting clients
  lastLeaderId: null,         // track leader changes
  lastTerm: 0,                // track term changes
  replicasStatus: {}          // track status of all replicas
};

const log = (msg) => console.log(`[GATEWAY] ${msg}`);

wss.on('connection', (ws) => {
  state.clients.add(ws);
  log(`Client connected. Total: ${state.clients.size}`);
  broadcast({
    type: 'event',
    message: '👤 New Client Connected',
    severity: 'success',
    details: `Total clients: ${state.clients.size}`
  });

  if (state.committedLog.length > 0) {
    ws.send(JSON.stringify({ type: 'replay', strokes: state.committedLog }));
  }

  // Send initial replicas status
  ws.send(JSON.stringify({ type: 'replicas-status', replicas: state.replicasStatus }));

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
    log(`Client disconnected. Total: ${state.clients.size}`);
    broadcast({
      type: 'event',
      message: '👤 Client Disconnected',
      severity: 'info',
      details: `Remaining clients: ${state.clients.size}`
    });
  });
});

async function forwardStrokeToLeader(stroke) {
  if (!state.leaderUrl) {
    log('No leader known yet, dropping stroke');
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
            log(`Leader redirect received: ${newLeaderId}`);
            // attempt rediscover immediately or let polling do it
            await discoverLeader();
        }
    }
  } catch (e) {
    log(`Failed to reach leader, triggering rediscovery: ${e.message}`);
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
          const newLeaderId = data.id;
          log(`New leader discovered: ${url} (${newLeaderId}, term ${data.term})`);
          
          // Broadcast leader election event
          broadcast({
            type: 'event',
            message: '👑 New Leader Elected',
            severity: 'success',
            details: `Leader: ${newLeaderId} at term ${data.term}`
          });
          
          state.lastLeaderId = newLeaderId;
          state.lastTerm = data.term;
        }
        state.leaderUrl = url;
        return;
      }
    } catch (_) {}
  }
}

async function pollReplicasStatus() {
  const newStatus = {};
  for (const url of state.replicaUrls) {
    try {
      const res = await fetch(`${url}/status`, { timeout: 1000 });
      const data = await res.json();
      newStatus[data.id] = {
        role: data.role,
        term: data.term,
        logLength: data.logLength,
        commitIndex: data.commitIndex
      };
      
      // Detect term changes
      if (state.replicasStatus[data.id]?.term !== data.term) {
        log(`Term change on ${data.id}: ${state.replicasStatus[data.id]?.term || 0} -> ${data.term}`);
      }
    } catch (_) {}
  }
  state.replicasStatus = newStatus;
  broadcast({ type: 'replicas-status', replicas: state.replicasStatus });
}

setInterval(discoverLeader, 500);
setInterval(pollReplicasStatus, 1000);

app.post('/committed', (req, res) => {
  const { stroke } = req.body;
  state.committedLog.push(stroke);
  broadcast({ type: 'stroke', stroke });
  res.json({ success: true });
});

app.post('/leader-update', (req, res) => {
  const { leaderId, leaderUrl } = req.body;
  log(`Leader update received: ${leaderId} at ${leaderUrl}`);
  state.leaderUrl = leaderUrl;
  res.json({ success: true });
});

app.post('/event', (req, res) => {
  const { message, type, details, source } = req.body;
  log(`Event from ${source}: ${message}`);
  broadcast({
    type: 'event',
    message: message,
    severity: type,
    details: details
  });
  res.json({ success: true });
});

app.post('/kill-leader', async (req, res) => {
  if (!state.leaderUrl) return res.status(404).json({ error: 'No leader known' });
  try {
    fetch(`${state.leaderUrl}/crash`, { method: 'POST' }).catch(() => {});
    const oldLeader = state.leaderUrl;
    state.leaderUrl = null;
    log(`Crash command sent to ${oldLeader}`);
    broadcast({
      type: 'event',
      message: '💥 Leader Crash Simulated',
      severity: 'failure',
      details: `Old leader: ${oldLeader}`
    });
    res.json({ success: true, message: `Crash command sent to ${oldLeader}` });
  } catch (e) {
    res.status(500).json({ error: 'Failed to send crash command' });
  }
});

app.get('/log', (req, res) => {
  res.json({ strokes: state.committedLog });
});

app.get('/leader-status', (req, res) => {
  const leader = state.replicaUrls.find(u => u === state.leaderUrl);
  res.json({ 
    leaderUrl: state.leaderUrl,
    leaderId: state.lastLeaderId || (state.leaderUrl ? state.leaderUrl.split('//')[1].split(':')[0] : null),
    term: state.lastTerm
  });
});

function broadcast(msg) {
  const data = JSON.stringify(msg);
  state.clients.forEach(client => {
    if (client.readyState === 1) client.send(data);
  });
}

server.listen(8080, () => log('Listening on :8080'));

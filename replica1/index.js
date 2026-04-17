const express = require('express');
const fetch = require('node-fetch');
const app = express();
app.use(express.json());

const PORT = process.env.REPLICA_PORT || 3001;

let state = {
  id: process.env.REPLICA_ID || 'replica1',
  role: 'follower',
  term: 0,
  votedFor: null,
  log: [],
  commitIndex: -1,
  leaderId: null
};

let electionTimer;
let heartbeatInterval;

const log = (msg) => console.log(`[${state.id}][${state.role.toUpperCase()}][T:${state.term}] ${msg}`);

function notifyGatewayEvent(message, type = 'info', details = '') {
  const gatewayUrl = process.env.GATEWAY_NOTIFY_URL;
  if (!gatewayUrl) return;
  const eventUrl = gatewayUrl.replace('/leader-update', '/event');
  fetch(eventUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, type, details, source: state.id })
  }).catch(() => {});
}

function resetElectionTimer() {
  clearTimeout(electionTimer);
  const timeout = 500 + Math.floor(Math.random() * 300);
  electionTimer = setTimeout(startElection, timeout);
}

async function startElection() {
  state.term++;
  state.role = 'candidate';
  state.votedFor = state.id;
  log('Started election');
  notifyGatewayEvent(`🗳️ ${state.id} Started Election`, 'election', `Term: ${state.term}`);
  
  let votes = 1;
  const peers = process.env.PEER_URLS ? process.env.PEER_URLS.split(',') : [];
  
  const voteRequests = peers.map(url =>
    fetch(`${url}/request-vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        term: state.term,
        candidateId: state.id,
        lastLogIndex: state.log.length - 1,
        lastLogTerm: state.log.length > 0 ? state.log[state.log.length-1].term : 0 
      })
    }).then(r => r.json()).catch(() => ({ voteGranted: false }))
  );
  
  const results = await Promise.all(voteRequests);
  results.forEach(r => { if (r.voteGranted) votes++; });
  
  log(`Got ${votes} votes`);
  
  if (state.role === 'candidate' && votes >= 2) becomeLeader();
  else if (state.role === 'candidate') {
    notifyGatewayEvent(`⏳ ${state.id} Election Retry`, 'info', `Term: ${state.term}`);
    setTimeout(startElection, 150 + Math.floor(Math.random() * 150));
  }
}

function becomeLeader() {
  state.role = 'leader';
  state.leaderId = state.id;
  log('Became LEADER');
  notifyGatewayEvent(`👑 ${state.id} Became LEADER`, 'success', `Term: ${state.term}`);
  heartbeatInterval = setInterval(sendHeartbeats, 150);
  notifyGateway();
  sendHeartbeats();
}

function sendHeartbeats() {
  const peers = process.env.PEER_URLS ? process.env.PEER_URLS.split(',') : [];
  peers.forEach(url => {
    fetch(`${url}/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ term: state.term, leaderId: state.id, commitIndex: state.commitIndex })
    }).catch(() => {});
  });
}

function notifyGateway() {
  const gatewayUrl = process.env.GATEWAY_NOTIFY_URL;
  if (!gatewayUrl) return;
  fetch(gatewayUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ leaderId: state.id, leaderUrl: `http://${state.id}:${PORT}` })
  }).catch(() => {});
}

app.post('/request-vote', async (req, res) => {
  const { term, candidateId, lastLogIndex, lastLogTerm } = req.body;
  if (term > state.term) { 
    state.term = term; 
    state.role = 'follower'; 
    state.votedFor = null; 
    clearTimeout(heartbeatInterval);
    log(`Received higher term from ${candidateId}: ${term}`);
  }
  const alreadyVoted = state.votedFor && state.votedFor !== candidateId;
  const candidateLogOk = lastLogIndex >= state.log.length - 1;
  const voteGranted = !alreadyVoted && candidateLogOk && term >= state.term;
  if (voteGranted) { 
    state.votedFor = candidateId; 
    resetElectionTimer();
    log(`Voted for ${candidateId}`);
  }
  res.json({ voteGranted, term: state.term });
});

app.post('/append-entries', async (req, res) => {
  const { term, leaderId, prevLogIndex, prevLogTerm, entry, entries, commitIndex } = req.body;
  if (term < state.term) return res.json({ success: false, term: state.term });
  if (term > state.term) {
    state.term = term;
    log(`Received higher term from ${leaderId}: ${term}`);
  }
  state.role = 'follower'; 
  state.leaderId = leaderId;
  clearTimeout(heartbeatInterval);
  resetElectionTimer();
  
  if (prevLogIndex >= 0) {
    if (state.log.length <= prevLogIndex || state.log[prevLogIndex].term !== prevLogTerm) {
      return res.json({ success: false, logLength: state.log.length });
    }
  }
  
  if (entry) { state.log.push({ ...entry, term }); }
  if (entries) {
    entries.forEach(e => {
        if (!state.log.some(l => l.index === e.index)) {
            state.log.push({ ...e, term });
        }
    });
  }
  
  if (commitIndex > state.commitIndex) state.commitIndex = Math.min(commitIndex, state.log.length - 1);
  res.json({ success: true, logLength: state.log.length });
});

app.post('/heartbeat', (req, res) => {
  const { term, leaderId, commitIndex } = req.body;
  if (term < state.term) return res.json({ success: false });
  state.term = term; 
  state.role = 'follower'; 
  state.leaderId = leaderId;
  clearTimeout(heartbeatInterval);
  resetElectionTimer();
  if (commitIndex > state.commitIndex) state.commitIndex = commitIndex;
  res.json({ success: true, term: state.term });
});

app.get('/sync-log', (req, res) => {
  const from = parseInt(req.query.from) || 0;
  const entries = state.log.slice(from).filter((_, i) => from + i <= state.commitIndex);
  res.json({ entries, commitIndex: state.commitIndex });
});

app.post('/crash', (req, res) => {
  log('CRASH endpoint called. Simulating failure...');
  notifyGatewayEvent(`💥 ${state.id} Crashed`, 'failure');
  process.exit(1);
});

app.get('/status', (req, res) => {
  res.json({
    id: state.id, role: state.role, term: state.term,
    logLength: state.log.length, commitIndex: state.commitIndex,
    leaderId: state.leaderId
  });
});

async function replicateStroke(stroke) {
  const entry = { ...stroke, term: state.term, index: state.log.length };
  state.log.push(entry);
  const prevLogIndex = state.log.length - 2;
  const prevLogTerm = prevLogIndex >= 0 ? state.log[prevLogIndex].term : 0;
  const peers = process.env.PEER_URLS.split(',');
  let acks = 1; // leader self-acks
  const replicateRequests = peers.map(url =>
    fetch(`${url}/append-entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ term: state.term, leaderId: state.id,
        prevLogIndex, prevLogTerm, entry, commitIndex: state.commitIndex })
    })
    .then(r => r.json())
    .then(async data => {
      if (!data) return;
      if (!data.success && data.logLength !== undefined) {
        await syncFollower(url, data.logLength);
        acks++;
      } else if (data.success) { acks++; }
    })
    .catch(() => {})
  );
  await Promise.all(replicateRequests);
  if (acks >= 2) {
    state.commitIndex = entry.index;
    return { committed: true, entry };
  }
  return { committed: false };
}

async function syncFollower(peerUrl, fromIndex) {
  const entries = state.log.slice(fromIndex).filter((_, i) => fromIndex + i <= state.commitIndex);
  await fetch(`${peerUrl}/append-entries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ term: state.term, leaderId: state.id,
      prevLogIndex: fromIndex - 1,
      prevLogTerm: fromIndex > 0 ? state.log[fromIndex-1].term : 0,
      entries, commitIndex: state.commitIndex })
  }).catch(()=>console.error('syncFollower failed'));
}

app.post('/stroke', async (req, res) => {
  if (state.role !== 'leader') {
    return res.status(307).json({ redirect: state.leaderId });
  }
  const stroke = req.body;
  const result = await replicateStroke(stroke);
  if (result.committed) {
    // Notify gateway of committed stroke
    const gatewayNotifyUrl = process.env.GATEWAY_NOTIFY_URL;
    if (gatewayNotifyUrl) {
      await fetch(gatewayNotifyUrl.replace('/leader-update', '/committed'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stroke: result.entry })
      }).catch(() => {});
    }
    res.json({ success: true });
  } else {
    res.status(500).json({ success: false, error: 'Failed to reach majority' });
  }
});

app.listen(PORT, () => {
    log(`Listening on ${PORT}`);
    resetElectionTimer();
});

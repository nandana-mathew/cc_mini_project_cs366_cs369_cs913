# MiniRAFT Comprehensive Technical Guide

**Purpose**: Complete reference for understanding every code segment, concept, and logic flow. Prepares for viva questions on RAFT, cloud computing, and distributed systems.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Code Segment Analysis](#code-segment-analysis)
   - Frontend (canvas.js, index.html)
   - Gateway (gateway/index.js)
   - Replicas (replica1/index.js, replica2/index.js, replica3/index.js)
3. [RAFT Concepts Deep Dive](#raft-concepts-deep-dive)
4. [Cloud Computing Concepts](#cloud-computing-concepts)
5. [Logic Flow Diagrams](#logic-flow-diagrams)
6. [Common Failure Scenarios](#common-failure-scenarios)
7. [VIVA Q&A](#viva-qa)
8. [Performance Analysis](#performance-analysis)

---

# Architecture Overview

## System Components

```
┌─────────────────────────────────────────────────────┐
│                  FRONTEND (Browser)                  │
│  ┌──────────────────────────────────────────────┐  │
│  │  HTML5 Canvas + Drawing Controls             │  │
│  │  - Brush colors, sizes, eraser               │  │
│  │  - Undo/Redo stacks                          │  │
│  │  - Local stroke history                      │  │
│  └──────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────┐  │
│  │  Dashboard (Right Panel)                      │  │
│  │  - Status tab (connection, leader, term)     │  │
│  │  - Events tab (real-time system events)      │  │
│  │  - Replicas tab (live status of all nodes)   │  │
│  └──────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────┐  │
│  │  canvas.js (Event Handlers & Logic)          │  │
│  │  - Drawing event handlers                    │  │
│  │  - WebSocket message handlers                │  │
│  │  - Undo/Redo management                      │  │
│  │  - Dashboard updates                         │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────┬───────────────┘
                                      │ WebSocket
                    ┌─────────────────┴─────────────────┐
                    │                                   │
            ┌───────▼────────┐              ┌──────────▼──────┐
            │ GATEWAY (8080) │              │  BROWSER (UI)   │
            │  ┌──────────┐  │              │                 │
            │  │ WebSocket│  │              │  Receives:      │
            │  │ Clients  │  │              │  - Strokes      │
            │  └──────────┘  │              │  - Events       │
            │  ┌──────────┐  │              │  - Leader info  │
            │  │ Leader   │  │              │  - Replica      │
            │  │Discovery │  │              │    status       │
            │  └──────────┘  │              │                 │
            │  ┌──────────┐  │              │  Sends:         │
            │  │ Event    │  │              │  - Drawing      │
            │  │Broadcast │  │              │    strokes      │
            │  └──────────┘  │              └─────────────────┘
            └───┬────────────┘
                │ HTTP RPC
    ┌───────────┼───────────┬─────────────┐
    │           │           │             │
┌───▼────┐ ┌───▼────┐ ┌───▼────┐        │
│Replica1│ │Replica2│ │Replica3│        │
│(LEADER)│ │(FOLL)  │ │(FOLL)  │        │
│Port    │ │Port    │ │Port    │        │
│3001    │ │3002    │ │3003    │        │
└────────┘ └────────┘ └────────┘        │
   ▲         ▲         ▲                │
   └─────────┼─────────┘                │
             │                          │
   RAFT RPC Requests                    │
   - RequestVote                        │
   - AppendEntries                      │
   - Heartbeat                          │
   - SyncLog                            │
```

## Data Flow

### Drawing Flow
```
User draws on canvas (mouse/touch events)
        ↓
canvas.js captures coordinates
        ↓
Stroke object created:
  {type, id, points, color, width, isEraser}
        ↓
Send via WebSocket to Gateway
        ↓
Gateway forwards to Leader replica
        ↓
Leader appends to local log
        ↓
Leader sends AppendEntries RPC to followers
        ↓
Followers append to their logs & acknowledge
        ↓
Leader waits for majority acknowledgment
        ↓
When 2+ nodes acknowledge → COMMITTED
        ↓
Leader notifies Gateway of committed stroke
        ↓
Gateway broadcasts to all connected clients
        ↓
Canvas renders stroke on all browsers
```

### Leader Election Flow
```
Follower timeout (500-800ms no heartbeat)
        ↓
Convert to Candidate
        ↓
Increment term (term++)
        ↓
Vote for self
        ↓
Send RequestVote RPC to peers
        ↓
Wait for responses (parallel)
        ↓
Count votes (need majority ≥2)
        ↓
If majority votes → Become Leader
        ↓
Notify Gateway of leadership
        ↓
Start sending heartbeats (150ms interval)
        ↓
If heartbeat missed → followers convert to candidates
        ↓
Repeat election (loop back to Candidate state)
```

---

# Code Segment Analysis

## Frontend Code Segments

### 1. HTML Structure (index.html)

#### Status Bar (Top)
```html
<div id="status-bar">
  <span><span class="status-dot dot-disconnected" id="conn-dot"></span>
    <span id="conn-status">Connecting...</span></span>
  <span>Leader: <strong id="leader-display">unknown</strong></span>
  <span>Term: <strong id="term-display">—</strong></span>
  <span>Log: <strong id="log-display">0</strong> strokes</span>
  <button id="kill-leader-btn">Simulate Leader Failure</button>
</div>
```

**Purpose**:
- Displays connection status (green connected, red disconnected, yellow reconnecting)
- Shows current leader name
- Shows current RAFT term
- Shows number of committed strokes
- Provides button to test failure scenarios

#### Canvas Section (Center)
```html
<canvas id="canvas"></canvas>
<div class="undo-redo-controls">
  <button class="undo-btn" id="undo-btn" disabled>↶ Undo</button>
  <button class="redo-btn" id="redo-btn" disabled>↷ Redo</button>
</div>
```

**Purpose**:
- Main drawing area (HTML5 Canvas API)
- Undo/Redo buttons for local history management
- Buttons disabled automatically when stacks empty

#### Dashboard Panel (Right)
```html
<div id="dashboard">
  <div id="dashboard-header">📊 System Dashboard</div>
  <div id="dashboard-tabs">
    <button class="dashboard-tab active" data-tab="status">Status</button>
    <button class="dashboard-tab" data-tab="events">Events</button>
    <button class="dashboard-tab" data-tab="replicas">Replicas</button>
  </div>
  <div id="dashboard-content">
    <!-- Tabs content -->
  </div>
</div>
```

**Purpose**:
- Tabbed interface for system monitoring
- Real-time status of connection, leader, term, logs, strokes
- Event log with timestamps (color-coded by type)
- Replica status showing role, term, log size, commit index

---

### 2. Canvas Drawing Logic (canvas.js)

#### Undo/Redo Stack Management

```javascript
let undoStack = [];      // Strokes that can be undone
let redoStack = [];      // Strokes that can be redone

function updateUndoRedoButtons() {
  document.getElementById('undo-btn').disabled = undoStack.length === 0;
  document.getElementById('redo-btn').disabled = redoStack.length === 0;
}
```

**Purpose**:
- Maintain two stacks: one for undo, one for redo
- Enable/disable buttons based on stack state

**Viva Q: Why two stacks instead of one?**
- Undo needs a way to go back → stores in undoStack
- Redo needs a way to go forward → stores in redoStack
- When user draws after undo, redoStack clears (can't redo anymore)

#### Undo Function

```javascript
function undo() {
  if (undoStack.length === 0) return;
  const removedStroke = strokes.pop();    // Remove from display
  undoStack.pop();                         // Remove from undo stack
  redoStack.push(removedStroke);           // Add to redo stack
  replayAll(strokes);                      // Redraw canvas
  updateUndoRedoButtons();
  addEventLog('↶ Local Undo', 'success');
}
```

**Logic**:
1. Pop stroke from main strokes array (removes from display)
2. Pop from undoStack (track what we undid)
3. Push to redoStack (can restore it later)
4. Replay entire canvas from remaining strokes
5. Update button states
6. Log to dashboard

**Key Insight**: Undo is LOCAL ONLY - doesn't affect distributed log. Fresh strokes from server maintain global consistency.

#### Mouse Drawing Events

```javascript
canvas.addEventListener('mousedown', e => {
  isDrawing = true;
  currentStroke = [getPos(e)];  // Start new stroke
});

canvas.addEventListener('mousemove', e => {
  if (!isDrawing) return;
  const pos = getPos(e);
  currentStroke.push(pos);       // Add point to current stroke
  if (currentStroke.length >= 2) {
    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  }
});

canvas.addEventListener('mouseup', sendStroke);
canvas.addEventListener('mouseleave', sendStroke);
```

**Logic**:
- mousedown: Initialize new stroke with first point
- mousemove: Add subsequent points and render line incrementally
- mouseup/mouseleave: Send completed stroke to server

**Why incremental rendering?**
- Updates display immediately (perceived responsiveness)
- Avoids lag waiting for server acknowledgment

---

### 3. WebSocket Management (canvas.js)

#### Connection Establishment

```javascript
function connect() {
  updateStatus('reconnecting');
  const wsUrl = `ws://${window.location.host}`;
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    updateStatus('connected');
    reconnectDelay = 1000;  // Reset delay on success
    addEventLog('🔗 Connected to Gateway', 'success');
  };

  ws.onclose = () => {
    updateStatus('disconnected');
    addEventLog('⚠️ Disconnected from Gateway', 'failure');
    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, maxDelay);  // Exponential backoff
  };

  ws.onerror = () => ws.close();
}
```

**Reconnection Strategy - Exponential Backoff**:
- 1st retry: 1s delay
- 2nd retry: 2s delay
- 3rd retry: 4s delay
- ...keeps doubling until maxDelay (10s)

**Why?**
- Prevents overwhelming server with rapid reconnect attempts
- Gives server time to recover
- Eventually settles to stable polling interval

#### Message Handling

```javascript
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  
  if (msg.type === 'stroke') {
    // Incoming stroke from other clients
    strokes.push(msg.stroke);
    renderStroke(msg.stroke);
    redoStack = [];            // Clear redo when new stroke arrives
    undoStack.push(msg.stroke);
    updateUndoRedoButtons();
    
  } else if (msg.type === 'replay') {
    // Full log replay (on reconnect)
    strokes.length = 0;
    strokes.push(...msg.strokes);
    replayAll(strokes);
    undoStack = [...msg.strokes];
    redoStack = [];
    
  } else if (msg.type === 'leader-info') {
    // Leader update from gateway
    document.getElementById('leader-display').textContent = msg.leaderId;
    document.getElementById('term-display').textContent = msg.term;
    
  } else if (msg.type === 'event') {
    // System event (election, crash, etc)
    addEventLog(msg.message, msg.severity, msg.details);
    
  } else if (msg.type === 'replicas-status') {
    // Replica status update
    updateReplicasInfo(msg.replicas);
  }
};
```

**Message Types**:
1. **stroke** - New stroke committed by leader
2. **replay** - Full log on reconnect (important!)
3. **leader-info** - Current leader and term
4. **event** - System events for dashboard
5. **replicas-status** - Status of all replica nodes

**Critical Logic**: When new stroke arrives from server, we:
- Clear redoStack (can't redo anymore)
- Add to undoStack (can undo server strokes too!)
- This maintains undo/redo semantics across client+server

---

## Gateway Code Analysis

### Gateway State Management

```javascript
const state = {
  clients: new Set(),           // Currently connected WebSocket clients
  leaderUrl: null,              // HTTP URL of current leader
  replicaUrls: [...],           // All replica URLs
  committedLog: [],             // Committed strokes
  lastLeaderId: null,           // Track leader changes
  lastTerm: 0,                  // Track term changes
  replicasStatus: {}            // Status cache of all replicas
};
```

**Why this state?**
- Gateway is stateless for fault tolerance
- Committed log: To send to new clients on connect
- Leader tracking: To route incoming strokes
- Replica status: To broadcast to dashboard

### WebSocket Connection Handler

```javascript
wss.on('connection', (ws) => {
  state.clients.add(ws);
  log(`Client connected. Total: ${state.clients.size}`);
  broadcast({
    type: 'event',
    message: '👤 New Client Connected',
    severity: 'success',
    details: `Total clients: ${state.clients.size}`
  });

  // Send full log replay to new client
  if (state.committedLog.length > 0) {
    ws.send(JSON.stringify({ type: 'replay', strokes: state.committedLog }));
  }

  // Send current replica status
  ws.send(JSON.stringify({ type: 'replicas-status', replicas: state.replicasStatus }));

  ws.on('message', async (raw) => {
    const msg = JSON.parse(raw);
    if (msg.type === 'stroke') {
      await forwardStrokeToLeader(msg);
    }
  });

  ws.on('close', () => {
    state.clients.delete(ws);
    log(`Client disconnected. Total: ${state.clients.size}`);
    broadcast({
      type: 'event',
      message: '👤 Client Disconnected',
      severity: 'info'
    });
  });
});
```

**Key Design Pattern**:
1. On connection: Send full log replay (idempotent recovery)
2. On message: Route to leader
3. On close: Update dashboard

**Why full log on connect?**
- New client needs full drawing history
- Ensures consistency: can't draw partial canvas
- Replays all committed strokes (safe, idempotent)

### Leader Discovery & Polling

```javascript
async function discoverLeader() {
  for (const url of state.replicaUrls) {
    try {
      const res = await fetch(`${url}/status`, { timeout: 1000 });
      const data = await res.json();
      if (data.role === 'leader') {
        if (state.leaderUrl !== url) {
          log(`New leader discovered: ${url} (${data.id}, term ${data.term})`);
          broadcast({
            type: 'event',
            message: '👑 New Leader Elected',
            severity: 'success',
            details: `Leader: ${data.id} at term ${data.term}`
          });
          state.lastLeaderId = data.id;
          state.lastTerm = data.term;
        }
        state.leaderUrl = url;
        return;
      }
    } catch (_) {}
  }
}

setInterval(discoverLeader, 500);  // Poll every 500ms
```

**Why separate discovery from direct calls?**
- If leader crashes mid-call, next call will find new leader
- 500ms polling detects failures quickly (faster than manual refresh)
- Decouples stroke forwarding from leader detection

### Replica Status Polling

```javascript
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
    } catch (_) {}
  }
  state.replicasStatus = newStatus;
  broadcast({ type: 'replicas-status', replicas: state.replicasStatus });
}

setInterval(pollReplicasStatus, 1000);  // Poll every 1s
```

**Real-time Dashboard Updates**:
- Broadcasts replica status every 1 second
- Clients receive live role, term, log size updates
- Enables visual feedback: "replica1 is LEADER at term 2"

---

## Replica Code Analysis (RAFT Implementation)

### Replica State

```javascript
let state = {
  id: process.env.REPLICA_ID || 'replica1',  // Unique identifier
  role: 'follower',                            // follower, candidate, or leader
  term: 0,                                     // Current logical clock (monotonic)
  votedFor: null,                              // Who this replica voted for this term
  log: [],                                     // Append-only log of strokes
  commitIndex: -1,                             // Highest index known to be committed
  leaderId: null                               // Known leader (if any)
};
```

**RAFT State Machine Invariants**:
1. term is monotonically increasing (never decreases)
2. votedFor is set per term (can vote for only 1 candidate per term)
3. log is append-only (never remove, only append)
4. commitIndex ≤ log length

### Election Timeout

```javascript
function resetElectionTimer() {
  clearTimeout(electionTimer);
  const timeout = 500 + Math.floor(Math.random() * 300);  // 500-800ms
  electionTimer = setTimeout(startElection, timeout);
}
```

**Timeout Range: 500-800ms**

Why randomization?
- Prevents split votes (backup candidates wait longer)
- First replica to timeout becomes candidate
- Faster than fixed timeouts (collision-free)

**How it works**:
- Called on every heartbeat/RPC (restarts timer)
- If no heartbeat within 500-800ms → startElection()
- Ensures leader proves liveness (heartbeats)
- Detects leader failure quickly

### Election Process

```javascript
async function startElection() {
  state.term++;                        // Increment term
  state.role = 'candidate';            // Convert to candidate
  state.votedFor = state.id;           // Vote for self
  log('Started election');
  notifyGatewayEvent(`🗳️ ${state.id} Started Election`, 'election', `Term: ${state.term}`);
  
  let votes = 1;                       // Self vote counts
  const peers = process.env.PEER_URLS ? process.env.PEER_URLS.split(',') : [];
  
  const voteRequests = peers.map(url =>
    fetch(`${url}/request-vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        term: state.term,
        candidateId: state.id,
        lastLogIndex: state.log.length - 1,
        lastLogTerm: state.log.length > 0 ? state.log[state.log.length - 1].term : 0
      })
    }).then(r => r.json()).catch(() => ({ voteGranted: false }))
  );
  
  const results = await Promise.all(voteRequests);  // Wait for all votes
  results.forEach(r => { if (r.voteGranted) votes++; });
  
  log(`Got ${votes} votes`);
  
  if (state.role === 'candidate' && votes >= 2) {
    becomeLeader();  // Majority achieved
  } else if (state.role === 'candidate') {
    notifyGatewayEvent(`⏳ ${state.id} Election Retry`, 'info', `Term: ${state.term}`);
    setTimeout(startElection, 150 + Math.floor(Math.random() * 150));  // Retry
  }
}
```

**Election Steps**:
1. Increment term (signals cluster of new election round)
2. Vote for self
3. Send RequestVote RPC to all peers
4. Wait for all responses (Promise.all)
5. Count votes: if ≥2 → leader, else retry

**Why wait for all responses?**
- If a peer is down, we eventually timeout (network timeout)
- Parallel requests faster than sequential
- If node is partitioned, it will get fewer votes

### RequestVote RPC Handler

```javascript
app.post('/request-vote', async (req, res) => {
  const { term, candidateId, lastLogIndex, lastLogTerm } = req.body;
  
  // If candidate's term > ours, we're behind
  if (term > state.term) { 
    state.term = term;           // Adopt higher term
    state.role = 'follower';     // Demote to follower
    state.votedFor = null;       // Clear vote
    clearTimeout(heartbeatInterval);
    log(`Received higher term from ${candidateId}: ${term}`);
  }
  
  // Check if we've already voted for someone else this term
  const alreadyVoted = state.votedFor && state.votedFor !== candidateId;
  
  // Check log consistency: candidate must have >= our log
  const candidateLogOk = lastLogIndex >= state.log.length - 1;
  
  // Vote only if: candidate's term >= ours AND we haven't voted AND log ok
  const voteGranted = !alreadyVoted && candidateLogOk && term >= state.term;
  
  if (voteGranted) { 
    state.votedFor = candidateId;
    resetElectionTimer();   // Restart election timer (candidate proven alive)
    log(`Voted for ${candidateId}`);
  }
  
  res.json({ voteGranted, term: state.term });
});
```

**Voting Rules**:
1. If grantee's term > ours: adopt term (convergence to higher term)
2. Check if already voted (one vote per term max)
3. Check log consistency (safety: only vote for complete logs)
4. If all checks pass: grant vote

**Why restart election timer when voting?**
- Voting for a candidate acknowledges it's active
- No need for me to become candidate (don't need election)
- Resets timeout so we wait for candidate's heartbeat

### Leadership & Heartbeats

```javascript
function becomeLeader() {
  state.role = 'leader';
  state.leaderId = state.id;
  log('Became LEADER');
  notifyGatewayEvent(`👑 ${state.id} Became LEADER`, 'success', `Term: ${state.term}`);
  
  heartbeatInterval = setInterval(sendHeartbeats, 150);  // 150ms heartbeat interval
  notifyGateway();    // Tell gateway about leadership
  sendHeartbeats();   // Send first heartbeat immediately
}

function sendHeartbeats() {
  const peers = process.env.PEER_URLS ? process.env.PEER_URLS.split(',') : [];
  peers.forEach(url => {
    fetch(`${url}/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        term: state.term,
        leaderId: state.id,
        commitIndex: state.commitIndex
      })
    }).catch(() => {});
  });
}
```

**Heartbeat Interval: 150ms**

Why 150ms when election timeout is 500-800ms?
- Must send heartbeats often enough to prevent elections
- Rule: heartbeat interval << election timeout
- 150ms << 500ms ✓ (safe margin)

**Heartbeat content**:
- term: Current term (safety)
- leaderId: Sender identity
- commitIndex: Highest committed index (so followers know what's committed)

**Why fire immediately?**
- Signal quick leadership takeover
- If followers don't get quick heartbeat, they might re-elect
- Shows leader is alive

### Append Entries (Log Replication)

```javascript
app.post('/append-entries', async (req, res) => {
  const { term, leaderId, prevLogIndex, prevLogTerm, entry, entries, commitIndex } = req.body;
  
  // If leader's term < ours, reject (stale leader)
  if (term < state.term) return res.json({ success: false, term: state.term });
  
  // If leader's term >= ours, it's valid leader
  if (term > state.term) {
    state.term = term;
    log(`Received higher term from ${leaderId}: ${term}`);
  }
  
  state.role = 'follower';        // Acknowledge leadership
  state.leaderId = leaderId;
  clearTimeout(heartbeatInterval);
  resetElectionTimer();           // Reset election timer (leader active)
  
  // Log consistency check: leader's previous entry must match ours
  if (prevLogIndex >= 0) {
    if (state.log.length <= prevLogIndex || state.log[prevLogIndex].term !== prevLogTerm) {
      return res.json({ success: false, logLength: state.log.length });
    }
  }
  
  // Append new entry/entries
  if (entry) { state.log.push({ ...entry, term }); }
  if (entries) {
    entries.forEach(e => {
      if (!state.log.some(l => l.index === e.index)) {
        state.log.push({ ...e, term });
      }
    });
  }
  
  // Update commit index (leader told us what's safe to commit)
  if (commitIndex > state.commitIndex) 
    state.commitIndex = Math.min(commitIndex, state.log.length - 1);
  
  res.json({ success: true, logLength: state.log.length });
});
```

**Log Consistency Check (Core RAFT Safety)**:

Why check prevLogIndex and prevLogTerm?
- Ensures logs match at previous entry
- Prevents partial/inconsistent replication
- If check fails: leader knows to send more history

**Example:**
```
Leader log:   [A:T1, B:T2, C:T3]
Follower log: [A:T1, X:T1]                    (X != B)

Leader sends: AppendEntries(prevLogIndex=1, prevLogTerm=T2, entry=B)
  prevLogIndex=1 → log[1] should be term T2
  Follower check: log[1] is X with term T1
  Check fails! → respond with logLength=2

Leader sees logLength=2 → calls /sync-log from index 2
  Gets entries B and C
  Sends them to follower
```

### Stroke Submission (Client API)

```javascript
app.post('/stroke', async (req, res) => {
  // Only leader can accept strokes
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
```

**Why non-leader responds with 307?**
- Client shouldn't know who leader is
- Gateway should handle retries
- Redirect tells gateway to look for new leader

### Replication Logic

```javascript
async function replicateStroke(stroke) {
  // Append to local log
  const entry = { ...stroke, term: state.term, index: state.log.length };
  state.log.push(entry);
  
  const prevLogIndex = state.log.length - 2;
  const prevLogTerm = prevLogIndex >= 0 ? state.log[prevLogIndex].term : 0;
  
  const peers = process.env.PEER_URLS.split(',');
  let acks = 1; // Leader counts itself
  
  // Send to all followers
  const replicateRequests = peers.map(url =>
    fetch(`${url}/append-entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        term: state.term, 
        leaderId: state.id,
        prevLogIndex, 
        prevLogTerm, 
        entry, 
        commitIndex: state.commitIndex 
      })
    })
    .then(r => r.json())
    .then(async data => {
      if (!data) return;
      if (!data.success && data.logLength !== undefined) {
        // Follower rejected: log mismatch
        // Send history from logLength onward
        await syncFollower(url, data.logLength);
        acks++;
      } else if (data.success) { 
        acks++;  // Counted as acknowledged
      }
    })
    .catch(() => {})
  );
  
  await Promise.all(replicateRequests);
  
  // Check majority
  if (acks >= 2) {
    state.commitIndex = entry.index;
    return { committed: true, entry };
  }
  
  return { committed: false };
}
```

**Replication Steps**:
1. Append to own log immediately
2. Send to all followers in parallel
3. If follower rejects: call /sync-log to catch up
4. Count positive responses (not including self)
5. If ≥2 acks total (including self) → COMMITTED

**Why reply on follower failure?**
- Don't wait for timeout
- Proactively sync the lagging follower
- Ensures fast recovery

### Sync Log (Catch-up Protocol)

```javascript
async function syncFollower(peerUrl, fromIndex) {
  // Get entries from this index onward (only committed ones)
  const entries = state.log.slice(fromIndex)
    .filter((_, i) => fromIndex + i <= state.commitIndex);
  
  await fetch(`${peerUrl}/append-entries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      term: state.term, 
      leaderId: state.id,
      prevLogIndex: fromIndex - 1,
      prevLogTerm: fromIndex > 0 ? state.log[fromIndex - 1].term : 0,
      entries, 
      commitIndex: state.commitIndex 
    })
  }).catch(() => console.error('syncFollower failed'));
}
```

**Catch-up Process**:
1. Get entries from failed index onward
2. Only include committed entries (for safety)
3. Send with prevLogIndex/prevLogTerm for consistency check
4. Follower appends and updates commit index

**Example:**
```
Leader: [A:T1, B:T2, C:T3, D:T3] (commitIndex=3)
Follower: [A:T1]

Replication fails (log mismatch at index 1)
→ Leader calls syncFollower(url, 1)
→ Gets entries [B:T2, C:T3, D:T3] from index 1-3
→ Sends with prevLogIndex=0, prevLogTerm=T1  
→ Follower checks: log[0] = A:T1 ✓
→ Appends [B:T2, C:T3, D:T3]
→ Updates commitIndex to 3
```

---

# RAFT Concepts Deep Dive

## 1. Terms

```
Timeline:
T0 ──┐ Follower phase
     ├─ No leader elected
     └─ Servers stay in follower state
     
     ┌─ Candidate phase
T1 ──┤ Servers start elections
     ├─ Vote messages exchanged
     └─ New leader elected
     
     ┌─ Leader phase
T1 ──┤ Leader sends heartbeats
     ├─ Log replication occurs
     └─ Cluster stable
     
     ┌─ Candidate phase (old leader crashed)
T2 ──┤ Candidates compete again
     ├─ Vote messages exchanged
     └─ New leader elected
```

**Key Properties**:
- Monotonically increasing: never decreases
- Marks election round
- Each replica tracks current term
- Higher term always wins
- Forces stale leaders to step down

**Safety Rule**: If term_X > term_Y, requests from X override requests from Y

## 2. Voting

**One Vote Per Term Rule**:
- Each replica votes for at most ONE candidate per term
- Prevents split-brain (2 leaders claiming leadership)
- Ensures consensus

**Vote Granting Conditions**:
1. Candidate's term >= replica's term
2. Replica hasn't voted yet for this term
3. Candidate's log is at least as complete as replica's

**Why log completeness matters?**
- Elected leader MUST have all committed entries
- Otherwise, committed data could be lost
- "At least as complete" = lastLogIndex >= follower's lastLogIndex

**Example of prevention**:
```
Scenario: Split brain without log check
├─ Server A: [Committed: 100 entries]
└─ Server B: [Committed: 50 entries]

Without log check:
  Server B could win election and become leader
  → Server B (with 50 entries) overwrites cluster state
  → Lost the 50 missing entries!

With log check:
  Server B's election fails (log not complete enough)
  → Server A remains leader or wins new election
  → All 100 entries preserved
```

## 3. Log Replication

**Two-Phase Commit Protocol**:

```
Phase 1: Append
┌──────────────────────────────────┐
│ Leader appends entry to local log│
│ Sends AppendEntries RPC to all   │
│ followers with prevLogIndex check│
└──────────────────────────────────┘
         ↓
┌──────────────────────────────────┐
│ Followers check log consistency  │
│ If OK: append to their logs      │
│ Response confirms receipt         │
└──────────────────────────────────┘

Phase 2: Commit
┌──────────────────────────────────┐
│ Leader waits for majority acks   │
│ When ≥50% have entry: COMMIT     │
│ Increments commitIndex            │
└──────────────────────────────────┘
         ↓
┌──────────────────────────────────┐
│ Leader sends next heartbeat with │
│ updated commitIndex               │
│ Followers learn what's committed │
└──────────────────────────────────┘
```

## 4. Quorum (Majority)

For 3-node cluster:
- Quorum size = 2 (majority of 3)
- Leader + 1 follower = consensus
- Can tolerate: 1 node failure

For 5-node cluster:
- Quorum size = 3
- Can tolerate: 2 node failures

**Why majority consensus?**
- Prevents split-brain when partition occurs
- If cluster splits 2-1:
  - 2-node partition → can form quorum (2≥2)
  - 1-node partition → cannot form quorum (1<2)
  - Only one side makes progress

## 5. Leader Election Timeout

```
No heartbeat for 500-800ms (random per replica)
         ↓
Follower becomes Candidate
         ↓
Sends RequestVote RPC to peers
         ↓
Waits for responses
         ↓
If majority votes grant → becomes Leader
If tie or minority → timeout, retry election
         ↓
Heartbeat sent every 150ms (new leader)
```

**Timeout randomization prevents ties**:
```
Without randomization:
├─ All followers timeout at exactly 500ms
├─ All become candidates simultaneously
└─ All send RequestVote at same time
   → Possible tie (both get 1 vote out of 3)

With randomization:
├─ Server A times out at 523ms → becomes candidate, wins
├─ Server B times out at 687ms → waits (saw heartbeat from A)
└─ Server C times out at 542ms → waits (saw heartbeat from A)
   → No tie, quick election
```

---

# Cloud Computing Concepts

## 1. Fault Tolerance

**Definition**: System continues operating even when components fail.

**In Our System**:
- Any replica can crash
- Gateway discovers new leader within 500ms
- Clients resume drawing without interruption
- Log entries preserved on majority nodes

**How We Achieve It**:
- Replication: 3 copies of state
- Majority consensus: changes only committed to 2+ nodes
- Quorum: only 2 nodes needed to make progress

**Levels of Fault Tolerance**:
1. Single node failure: System continues (2 nodes form quorum)
2. All 3 replicas down: System halted (no quorum)
3. Network partition: Only majority partition continues

## 2. Consistency vs Availability (CAP Theorem)

```
CAP Triangle:
    └─ Consistency (all replicas identical state)
    ├─ Availability (system always responds)
    └─ Partition Tolerance (survives network split)

Our choice: Consistency + Partition Tolerance (CP)
├─ Consistency: Commit requires majority
├─ Sacrifice: Minority partition stops making progress
├─ Reason: Drawing board must have identical views
```

**In Our System**:
- If network splits 2-1:
  - 2-node side: continues accepting strokes (≥2 nodes)
  - 1-node side: stops accepting (can't form quorum)
  - Prevents divergence (different canvas states)

**When network heals**:
- Split node syncs with leader
- Gets all missed strokes
- Canvas converges to identical state

## 3. State Machine Replication

**Pattern**:
```
Same input (strokes) → Deterministic processing → Identical outputs

├─ All replicas execute same strokes in same order
├─ All replicas compute identical canvas state
├─ If we replay log, we get same canvas
└─ No state divergence possible
```

**In Our System**:
1. Log is source of truth (strokes)
2. Replicas apply strokes identically
3. Canvas is derived state (replay all strokes)

**Safety**: If new client connects:
- Send full log replay
- Client replays all strokes
- Client canvas matches server (deterministic)

## 4. Event Sourcing

**Traditional Approach**:
```
Store current state:
├─ Canvas bitmap (raw pixels)
└─ ~1MB per user
```

**Event Sourcing**:
```
Store events (strokes):
├─ {x1, y1}, {x2, y2}, ... (coordinates)
├─ ~100 bytes per stroke
└─ Replay events → derive canvas
```

**Benefits**:
- Small log size
- Perfect audit trail (history)
- Can replay to any point in time
- Naturally distributes (log replication)

**In Our System**:
- Each stroke is event
- Log = sequence of events
- Canvas = current state (derived)

## 5. Distributed Consensus

**Problem**:
```
Multiple nodes with different information
Must agree on canonical version
```

**Solution - RAFT**:
```
1. Elect single leader (consensus)
2. Leader orders all changes (log)
3. Followers replicate leader's log
4. All nodes compute identical state
```

**Guarantees**:
- Safety: Different leaders never contradict each other
- Liveness: As long as majority alive and reachable

## 6. Zero-Downtime Deployment

**Traditional**:
```
Stop server (outage)
  ↓
Update code
  ↓
Start server (outage)
```

**Our System** (rolling update):
```
Kill replica (2 nodes remain)
  ├─ System still functional (2≥quorum)
  ├─ Strokes keep replicating
  └─ Clients don't disconnect
  ↓
Update replica code
  ↓
Restart replica
  ├─ Node boots as follower
  ├─ Leader syncs it automatically
  ├─ Back to 3 replicas
  └─ Never interrupted drawing
```

## 7. Service Discovery

**Problem**:
```
Client doesn't know which replica is leader
Hard-coded IPs break when replicas move
```

**Solution**:
```
Gateway periodically polls replicas (/status)
├─ Detects new leader
├─ Routes strokes to leader
└─ Clients call gateway (fixed address)

Replicas find each other via environment variables
├─ PEER_URLS = [replica1:3001, replica2:3002, replica3:3003]
├─ Set by docker-compose
└─ No discovery service needed
```

## 8. Circuit Breaker Pattern

**In Our Code**:
```javascript
// If replica is down, don't keep calling
try {
  fetch(replicaUrl, timeout: 1000)
} catch {
  // Replica is down, skip it
  // Next poll (500ms) will try again
}
```

**Benefit**: Doesn't wait for timeouts, fails fast

## 9. Exponential Backoff

**In Our Frontend**:
```javascript
reconnectDelay = 1000;  // start at 1s
setTimeout(connect, reconnectDelay);
reconnectDelay = Math.min(reconnectDelay * 2, 10000);
```

**Backoff sequence**: 1s → 2s → 4s → 8s → 10s → 10s ...

**Benefit**:
- Don't hammer gateway with reconnect attempts
- Gives server time to recover
- Eventually settles to stable polling

---

# Logic Flow Diagrams

## Leadership Flow

```
START (Server boots)
  │
  ├─ Set role = 'follower'
  ├─ Set term = 0
  ├─ Start election timer (500-800ms)
  │
FOLLOWER STATE
  │
  ├─ Listen for heartbeats
  │  ├─ Heartbeat received
  │  │  └─ Reset election timer ✓
  │  │
  │  └─ No heartbeat for 500-800ms
  │     └─ ELECTION TIMEOUT
  │
  ELECTION STATE
  │
  ├─ Increment term
  ├─ Become candidate
  ├─ Vote for self
  ├─ Send RequestVote RPC to peers
  ├─ Wait for responses
  │
  DECISION
  │
  ├─ If votes ≥ 2
  │  └─ BECOME LEADER
  │
  ├─ If votes < 2
  │  └─ RETRY ELECTION (after 150-300ms)
  │
LEADER STATE
  │
  ├─ Start heartbeat interval (150ms)
  ├─ Notify gateway of leadership
  │
  ├─ Accept client strokes
  │  ├─ Append to local log
  │  ├─ Send AppendEntries to followers
  │  ├─ Wait for majority acks
  │  ├─ Commit (update commitIndex)
  │  ├─ Reply to client (SUCCESS)
  │  └─ Broadcast to clients
  │
  └─ Receive higher term RPC
     ├─ Adopt higher term
     ├─ Become follower
     └─ Back to FOLLOWER STATE
```

## Log Replication Flow

```
Client sends stroke
  │
  ▼
Gateway routes to current leader
  │
  ▼
Leader:append-entries handler
  │
  ├─ Check: Is it valid leader? ✓
  ├─ Append to local log
  ├─ Send AppendEntries RPC to all followers (parallel)
  │
  ▼
Followers receive AppendEntries
  │
  ├─ Check: Log consistency
  │  ├─ If check FAILS
  │  │  └─ Reply {success: false, logLength}
  │  │
  │  └─ If check PASSES
  │     ├─ Append entry to log
  │     ├─ Update commitIndex (if leader sent it)
  │     └─ Reply {success: true}
  │
  ▼
Leader collects responses
  │
  ├─ Count acks (including self)
  │
  ├─ If any follower fails consistency check
  │  └─ Call syncFollower(url, logLength)
  │     ├─ Send entries from logLength onward
  │     └─ Follower catches up
  │
  ├─ If acks ≥ 2
  │  ├─ COMMITTED
  │  ├─ Update commitIndex
  │  ├─ Notify gateway: POST /committed
  │  └─ Reply to client: {success: true}
  │
  └─ If acks < 2
     └─ Reply to client: {success: false}
        └─ Client retries (gateway finds new leader)

Gateway broadcasts committed stroke
  │
  ├─ Send to all connected clients
  │  └─ Clients render stroke
  │  └─ All browsers show identical drawing
  │
  ▼
Done
```

---

# Common Failure Scenarios

## Scenario 1: Replica Crashes

```
Before:
├─ Replica1: LEADER (term 1)
├─ Replica2: FOLLOWER
└─ Replica3: FOLLOWER

Replica1 crashed
├─ No heartbeats sent
│
Replica2 & Replica3:
├─ Timeout (800ms)
├─ Become candidates
├─ Exchange votes
├─ One wins (e.g., Replica2)
│
After:
├─ Replica1: DOWN (no connection)
├─ Replica2: LEADER (term 2)
└─ Replica3: FOLLOWER (term 2)

Gateway discovers (500ms poll):
├─ Replica1 unreachable
├─ Finds Replica2 is leader
├─ Routes strokes to Replica2
├─ Dashboard shows new leader
└─ Clients continue drawing ✓

Replica1 restarts:
├─ Boots as follower
├─ Sees Replica2 as leader (term 2)
├─ Syncs log from Replica2
├─ Catches up to current state
└─ Cluster back to 3 nodes ✓
```

## Scenario 2: Network Partition

```
Before:
├─ Replica1: LEADER (term 1)
├─ Replica2: FOLLOWER
└─ Replica3: FOLLOWER

Network splits:
├─ Side A: [Replica1] (alone)
└─ Side B: [Replica2, Replica3] (together)

Side A (Replica1):
├─ Heartbeats to [2,3] fail
├─ Continues sending heartbeats (no timeout yet)
├─ Still claims to be leader (term 1)
├─ Doesn't accept new strokes (can't replicate)

Side B (Replica2, Replica3):
├─ Replica1's heartbeat fails (network down)
├─ Timeout after 800ms
├─ Become candidates
├─ Vote for winner (term 2)
├─ New leader elected (e.g. Replica2)
├─ Accept strokes (can reach 2 nodes)
├─ Strokes replicate normally

When partition heals:
├─ Replica1 receives heartbeat from Replica2 (term 2)
├─ Sees higher term → steps down immediately
├─ Becomes follower (term 2)
├─ Syncs missed strokes from Replica2
├─ Cluster converges ✓
```

**Why no data loss?**
- Side A: No strokes accepted (can't replicate)
- Side B: All strokes replicated safely
- When healed: Side A gets all strokes from Side B

## Scenario 3: Cascading Failures

```
T0: All replicas healthy (replica1 is leader)
  │
T10s: Replica1 crashes
  └─ Replica2 or 3 becomes leader
  │
T20s: Replica2 (current follower) crashes
  ├─ Only 2 replicas left
  ├─ New leader still can form quorum (2≥2)
  └─ System continues ✓
  │
T30s: Third replica crashes
  ├─ Only 1 replica left
  ├─ Cannot form quorum (1 < 2)
  ├─ No leader possible
  └─ SYSTEM HALTED ✗
     (No strokes accepted)

First replica recovers:
├─ Boots up
├─ Tries to replicate stroke
├─ Needs 2 nodes (quorum)
├─ Only has itself (1 node)
├─ Stroke rejected
└─ Broadcasts: "Cannot find majority"

When 2 replicas are alive:
├─ They can elect a leader
├─ System resumes
├─ First node syncs up
└─ System fully recovers ✓
```

---

# VIVA Q&A

## Basic Questions

**Q1: What is RAFT?**
A: RAFT is a consensus algorithm that ensures multiple nodes agree on state despite failures. It has three phases: leader election, log replication, and safety guarantees.

**Q2: Why 3 replicas?**
A: 3 replicas form a quorum of 2. This allows us to tolerate 1 failure while still making progress. Fewer (2) doesn't tolerate any failures; more (5) wastes resources.

**Q3: What happens if the leader crashes?**
A: Within 500-800ms, followers detect no heartbeat, start election, and a new leader is elected among remaining nodes. Gateway detects new leader within 500ms and routes strokes to it.

**Q4: How do we prevent split-brain?**
A: Through majority voting (2 out of 3 nodes). Each node votes for at most one candidate per term. A leader needs majority votes to be elected, preventing two leaders from claiming authority simultaneously.

**Q5: What's the purpose of terms?**
A: Terms are logical clocks. They increase with each election round and help replicas identify stale leaders. Higher term always wins, forcing outdated leaders to step down.

## Architecture Questions

**Q6: Why is the gateway stateless?**
A: Stateless gateways are horizontally scalable and don't cause data loss if they fail. They simply route traffic; real state is stored on RAFT replicas. If gateway dies, another can start immediately.

**Q7: What does event sourcing provide?**
A: Instead of storing final state (bitmap), we store history of events (strokes). This enables:
- Small log size
- Perfect audit trail
- Replay to any state
- Natural distribution

**Q8: How does the frontend know the leader?**
A: Gateway continuously polls replicas' /status endpoint every 500ms. When it detects a leader change, it broadcasts to clients. Clients see leader change in dashboard.

**Q9: Why parallel RPC calls in election?**
A: Sequential RPCs would be slow (3 timeouts = 3000ms). Parallel requests with timeout = 1000ms total. Faster elections = faster recovery.

**Q10: What's WebSocket used for vs HTTP?**
A: WebSocket: Client↔Gateway (long-lived, real-time bidirectional). HTTP: Gateway↔Replicas and Replica↔Replica (synchronous RPC, easier to implement).

## Fault Tolerance Questions

**Q11: What if 2 replicas crash?**
A: Only 1 node left. It cannot form quorum (1 < 2 needed) so it cannot commit new strokes. System halts until another replica recovers.

**Q12: What if network partitions?**
A: If split 2-1:
- 2-node side: Can form quorum, continues accepting strokes
- 1-node side: Cannot form quorum, stops accepting strokes
- Prevents divergence; when healed, convergence happens

**Q13: How does a restarted replica sync?**
A: It boots as follower. On first AppendEntries from leader that fails consistency check, it replies with current log length. Leader calls /sync-log sending all committed entries from that index onward. Follower catches up.

**Q14: What prevents data loss?**
A: Majority quorum. We only commit when ≥2 nodes have the entry. If one crashes, the other still has it. Data only lost if majority crashes simultaneously (unlikely).

**Q15: How fast is failover?**
A: Within 500-800ms (election timeout). In practice ~1-2 seconds because:
- Election timeout: 500-800ms
- New leader sends first heartbeat: 150ms
- Gateway discovers: ~500ms poll
- Total: ~1-2 seconds

## Deep Dive Questions

**Q16: Why do we check log consistency (prevLogIndex/prevLogTerm)?**
A: Ensures followers have identical logs up to that point. If check fails, it means there's a gap. We sync from the gap. Without this, followers could have conflicting entries.

**Q17: What happens if leader sends AppendEntries but crashes before commit?**
A: 
- Followers have the entry in their log
- But commitIndex not updated (leader didn't tell them it's committed)
- New leader either:
  - Confirms entry on its log → pushes commitIndex
  - Or ignores it if not in majority of logs
- Either way, consistent outcome

**Q18: Why does heartbeat include commitIndex?**
A: Tells followers what the leader considers committed. Followers update their commitIndex accordingly. Ensures followers know what strokes to display.

**Q19: Can a follower with more entries become leader?**
A: Yes, if its more recent entries have higher term. RAFT ensures "at least as up-to-date" but still elected if eligible. However, only if lastLogTerm is highest.

**Q20: What's exponential backoff for?**
A: Prevents flooding server with reconnect attempts during outage. 1s → 2s → 4s → 8s → 10s. Gives server time to recover between attempts.

## Implementation Questions

**Q21: Why Promises.all() in election?**
A: Waits for all vote responses in parallel. If slower, we can retry sooner. Allows election even if one replica is slow (timeout after ~1s).

**Q22: How does undo/redo work?**
A: Maintained locally (two stacks: undo and redo). Affected by:
- User undo → pops from undo stack, pushes to redo
- New stroke arrives → clears redo stack (can't redo after new input)
- Full replay → syncs with server state

**Q23: Why is log append-only?**
A: Simplicity. Prevents complex conflict resolution. New leader might have fewer entries (but higher term), but followers only append from leader. Eventually converges.

**Q24: What if two candidates have same votes?**
A: Both fail to reach majority (tie/split vote). Both timeout and retry. Randomized timeouts (500-800ms) mean one will timeout first and retry sooner, eventually winning.

**Q25: Why do we filter committed entries in sync-log?**
A: Only committed entries are safe to send (not going to be overwritten). Uncommitted entries might be lost if leader crashes. Safety first.

## Performance Questions

**Q26: What's the latency for a stroke?**
A: 
- User draws (instant on canvas)
- Send to Gateway (WebSocket, ~10ms)
- Gateway to Leader (HTTP, ~10ms)
- Leader replicates (AppendEntries, ~10-20ms per follower)
- Majority confirms (wait for 1 follower, ~20-30ms)
- Back to Gateway (~10ms)
- Broadcast to clients (~10ms)
- Total: ~100-200ms end-to-end

**Q27: Can we have multiple leaders?**
A: No. RAFT ensures only one leader per term through:
- One vote per term per node
- Need majority votes to become leader
- Can't have two majorities in 3 nodes

**Q28: What's the max throughput?**
A: Limited by replication:
- Each stroke needs append-entries round-trip
- ~30-50ms per stroke (network latency)
- Max: ~20-30 strokes/second
- Shared across all clients

**Q29: How many concurrent clients?**
A: Gateway can handle many WebSocket connections. Bottleneck is replica throughput (consensus limited). With more clients, strokes compete for consensus slots.

**Q30: What if we add a 4th replica?**
A: Quorum becomes 3 (out of 4). Can tolerate 1 failure (same as 3-node cluster). Replication slower (wait for 2 followers). Not worth it unless high durability needed.

---

# Performance Analysis

## Latency Components

```
Stroke End-to-End Latency:

User draws
  │ 0-100ms (local rendering)
  ├─ Points captured incrementally
  ├─ Canvas updated locally
  └─ Sent on mouseup/mouseleave
  │
  ▼ WebSocket send
  │ ~5-10ms (ping-pong)
  
  ▼ Gateway route
  │ ~5-10ms (server-side)
  ├─ Authenticate (none, open gateway)
  ├─ Lookup leader (cached)
  ├─ Forward to leader
  
  ▼ Leader receive
  │ ~0-5ms (process)
  ├─ Parse stroke
  ├─ Create log entry
  ├─ Append locally
  
  ▼ Replicate to followers
  │ ~15-30ms (AppendEntries RPC)
  ├─ 2 followers in parallel
  ├─ Each ~15-20ms network
  ├─ Each ~0-5ms processing
  
  ▼ Wait for majority acks
  │ ~15-30ms (max of 2 followers)
  ├─ Need 1 follower to reply
  ├─ Take fastest response
  
  ▼ Leader processes acks
  │ ~0-5ms
  ├─ Update commitIndex
  ├─ Notify gateway
  
  ▼ Gateway broadcasts
  │ ~5-10ms (to connected clients)
  ├─ Send to all clients (parallel)
  
  ▼ Client renders
  │ ~0-20ms
  ├─ Receive message
  ├─ Parse JSON
  ├─ Call renderStroke()
  ├─ Canvas updates
  
TOTAL: ~50-150ms typical (network dependent)
```

## Scalability

```
Horizontal Scaling:
├─ Gateway: Multiple instances (LB routes clients)
├─ Replicas: Limited to Quorum size (3-5 typical)
│  └─ Adding more replicas doesn't increase throughput
│  └─ Makes replication slower
│
├─ Clients: Unlimited (limited by gateway capacity)
│  └─ But strokes compete for consensus
│  └─ Throughput = 20-30 strokes/second for 3-node cluster

Vertical Scaling:
├─ Faster replicas → faster replication
├─ Lower-latency network → faster RPC
└─ Better throughput
```

## Failure Recovery Time

```
Time to Resume After Leader Crash:

Detection phase: 500-800ms
├─ Follower detects no heartbeat
├─ Randomized timeout prevents immediate re-election

Election phase: ~500ms
├─ Send RequestVote RPCs (parallel)
├─ Collect votes
├─ Elect new leader

Leadership phase: ~50-100ms
├─ New leader starts heartbeat
├─ Gateway polls and detects new leader

Gateway discovery: ~500ms
├─ Next poll interval (worst case)
└─ Can be ~100ms (best case if just polled)

Client update: ~50ms
├─ Broadcast new leader to connected clients
├─ Dashboard updates

TOTAL: 1-2 seconds typical (500ms + 500ms + 500ms = 1.5s worst case)
```

---

## Document End

This guide covers every aspect of the MiniRaft system for viva preparation. Review the Q&A section and run through the failure scenarios to build intuition for distributed systems concepts.


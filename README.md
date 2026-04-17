# Distributed Real-Time Drawing Board

A collaborative drawing board built on a custom **Mini-RAFT consensus protocol** — no Redis, no Socket.io rooms, no external message brokers. Just raw distributed systems engineering in Node.js.

---

## ✨ What It Does

Multiple users can draw on a shared canvas in real-time. Every stroke is treated as a log entry in a RAFT consensus cluster, guaranteeing that all connected users always see the same drawing — even if a server crashes mid-session.

### Features
- **Real-Time Collaborative Drawing** - Multiple users drawing simultaneously
- **Automatic Leader Election** - RAFT ensures exactly one leader manages the cluster
- **Fault Tolerance** - Any replica can crash; system continues with 2+ nodes alive
- **Zero-Downtime Failover** - When leader crashes, new leader elected within 1 second
- **Undo/Redo Functionality** - Local stroke history management
- **Enhanced Dashboard** - Real-time system monitoring with events and replica status
- **Event Sourcing** - Every action logged; canvas state reproducible by replaying log
- **WebSocket Reconnection** - Automatic reconnection with full log replay on reconnect

---

## 🏗️ Architecture

```
Multiple Browser Clients (WebSocket)
            ↓
      Gateway (Port 8080)
      Stateless WebSocket Server
            ↓
    ┌──────┼──────┐
    ↓      ↓      ↓
Replica1  Replica2  Replica3
(RAFT)    (RAFT)    (RAFT)
Port 3001  Port 3002  Port 3003
```

- **3 RAFT Replicas** — elect a leader, replicate strokes as log entries, handle failover automatically
- **Gateway** — stateless WebSocket server that discovers the current leader and routes strokes to it
- **Frontend** — HTML5 Canvas with WebSocket reconnection, full replay on reconnect, Undo/Redo support
- **Dashboard** — Real-time system monitoring (Connection, Leader, Term, Replicas, Events)

---

## 🚀 Quick Start (Local)

### Prerequisites
- Docker & Docker Compose installed
- Port 8080 available (Gateway)

### Run Locally

```bash
cd /home/nh-44/cc_mini_project
docker-compose up --build
```

Open `http://localhost:8080` in your browser.

### Test Fault Tolerance

**Scenario 1: Kill the current leader**
```bash
docker stop cc_mini_project-replica1-1
```
- System detects failure
- New leader elected within 1 second
- Dashboard shows new leader
- Drawing continues seamlessly

**Scenario 2: Restart a replica**
```bash
docker restart cc_mini_project-replica1-1
```
- Restarted node comes up as follower
- Leader sends full log via `/sync-log`
- Node catches up and rejoins cluster

**Scenario 3: Draw with simulated failure**
1. Open app at `http://localhost:8080`
2. Draw on canvas
3. Click "Simulate Leader Failure" button
4. Observe:
   - Leader crash event logged
   - New election starts
   - New leader elected
   - Drawing persists

---

## 📊 Dashboard Features

The enhanced **System Dashboard** provides real-time monitoring:

### Status Tab
- 🔗 **Connection Status** — WebSocket connection state
- 👑 **Current Leader** — Which replica is leader
- 📈 **Current Term** — Current RAFT term (increments with each election)
- 📝 **Log Entries** — Total strokes in distributed log
- 🎨 **Local Strokes** — Strokes on client's canvas

### Events Tab
- Real-time event log with timestamps
- Color-coded by severity (election, failure, success, info)
- Examples:
  - 🔗 Connected to Gateway
  - 👤 New Client Connected
  - 💥 Leader Crash Simulated
  - 🗳️ Replica Started Election
  - 👑 New Leader Elected

### Replicas Tab
Shows live status of all 3 RAFT nodes:
- 🖥️ Replica Name
- **Role** — Leader or Follower
- **Term** — Current RAFT term
- **Log Size** — Number of entries
- **Commit Index** — Highest committed index

---

## 🎨 UI Features

### Drawing Controls
- **Brush Sizes** — Adjustable from 2 to 20 pixels
- **Color Palette** — 6 colors + eraser tool
- **Touch Support** — Works on tablets and mobile

### Undo/Redo
- **Undo Button (↶)** — Removes last stroke from local canvas
- **Redo Button (↷)** — Restores undone stroke
- Buttons automatically enable/disable based on stack state
- Events logged in dashboard

---

## 🔧 How to Test Each Feature

### 1. Real-Time Replication
```
Action: Draw a line in one browser tab
Result: Line appears in second browser tab (same client)
Expected: Instant sync via WebSocket
```

### 2. Undo/Redo
```
Action: Draw → Click Undo → Click Redo
Result: Stroke removed → Stroke restored
Expected: Undo button disabled when empty, Redo disabled when no undo
```

### 3. Leader Election
```
Action: Draw → Simulate Leader Failure
Result: New leader elected within 1 second
Expected: Dashboard shows new leader, drawing continues
```

### 4. Log Replication
```
Action: Draw 3 strokes → Open Replicas tab
Result: All 3 replicas show "Log: 3 entries"
Expected: Automatic sync across cluster
```

### 5. Event Logging
```
Action: Any system event (draw, failover, election)
Result: Event appears in Events tab with timestamp
Expected: Real-time log of all system activity
```

---

## 📚 Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **RAFT from scratch** | No reliance on Redis/Kafka; teaches true distributed consensus |
| **Event sourcing** | Canvas state fully reproducible by replaying log |
| **Stateless gateway** | Trivially replaceable; failures don't cause data loss |
| **WebSocket for client communication** | Real-time, low-latency stroke delivery |
| **HTTP RPC for RAFT** | Synchronous communication between replicas |
| **Local undo/redo** | Doesn't affect distributed log; purely client-side |

---

## 🧬 Project Structure

```
cc_mini_project/
├── frontend/              # Browser application
│   ├── index.html         # UI with canvas, dashboard, controls
│   └── canvas.js          # Drawing logic, WebSocket, UI updates
├── gateway/               # WebSocket gateway
│   ├── index.js           # WebSocket server, event broadcasting
│   └── package.json
├── replica1/              # RAFT node 1
│   ├── index.js           # RAFT state machine
│   └── package.json
├── replica2/              # RAFT node 2
│   ├── index.js           # RAFT state machine
│   └── package.json
├── replica3/              # RAFT node 3
│   ├── index.js           # RAFT state machine
│   └── package.json
├── ecs/                   # AWS ECS deployment config
│   ├── *-task.json        # Task definitions
│   ├── *-service.json     # Service definitions
│   └── trust-policy.json
├── docker-compose.yml     # Local development setup
├── package.json           # Root dependencies
├── package-lock.json      # Dependency lock
├── README.md              # This file
├── GUIDE.md               # Detailed technical guide (VIVA PREP)
└── MiniRAFT.pdf           # Assignment specification
```

---

## 🌐 API Reference

### Gateway Endpoints

**WebSocket**
- `ws://localhost:8080` — Main client connection

**HTTP**
- `POST /committed` — Replica notifies gateway of committed stroke
- `POST /leader-update` — Replica notifies gateway of leadership
- `POST /event` — Replica sends event for dashboard
- `POST /kill-leader` — Trigger leader failure (testing)
- `GET /leader-status` — Get current leader info
- `GET /log` — Get committed log

### Replica Endpoints

- `POST /request-vote` — RAFT vote request from candidate
- `POST /append-entries` — RAFT log replication
- `POST /heartbeat` — RAFT leader heartbeat
- `POST /stroke` — Client stroke submission
- `GET /status` — Replica state (role, term, log)
- `GET /sync-log` — Sync log for lagging followers
- `POST /crash` — Simulate crash (testing)

---

## ☁️ AWS Deployment (ECS + Fargate)

### One-Time Setup

**1. Create ECR repositories**
```bash
aws ecr create-repository --repository-name raft-gateway --region us-east-1
aws ecr create-repository --repository-name raft-replica1 --region us-east-1
aws ecr create-repository --repository-name raft-replica2 --region us-east-1
aws ecr create-repository --repository-name raft-replica3 --region us-east-1
```

**2. Push images to ECR**
```bash
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com

docker build -t raft-gateway -f gateway/Dockerfile .
docker tag raft-gateway:latest <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/raft-gateway:latest
docker push <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/raft-gateway:latest

# Repeat for replica1, replica2, replica3
```

**3. Create ECS cluster**
```bash
aws ecs create-cluster --cluster-name raft-cluster --region us-east-1
```

**4. Create IAM role**
```bash
aws iam create-role --role-name ecsTaskExecutionRole \
  --assume-role-policy-document file://ecs/trust-policy.json

aws iam attach-role-policy --role-name ecsTaskExecutionRole \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
```

**5. Create Cloud Map namespace**
```bash
aws servicediscovery create-private-dns-namespace \
  --name raft.local --vpc <VPC_ID> --region us-east-1
```

**6. Deploy services**
```bash
aws ecs register-task-definition --cli-input-json file://ecs/replica1-task.json
aws ecs create-service --cli-input-json file://ecs/replica1-service.json
# Repeat for replica2, replica3, gateway
```

---

## 📖 RAFT Concepts Used

### Election
- **Term**: Logical clock; monotonically increasing
- **Timeout**: 500-800ms; triggers election if no heartbeat
- **Majority**: 2+ nodes (quorum for 3-node cluster)
- **Voting**: Nodes vote for 1 candidate per term

### Log Replication
- **AppendEntries RPC**: Leader sends log entries to followers
- **Acknowledgment**: Followers confirm receipt
- **Commit Index**: Log entries committed when majority acknowledges
- **Sync-Log**: Catch-up mechanism for lagging replicas

### Fault Tolerance
- **Split Brain Prevention**: Higher term always wins
- **Log Consistency**: Followers reject conflicting entries
- **Durability**: Committed entries never lost

---

## 🛠️ Technologies

| Component | Tech | Purpose |
|-----------|------|---------|
| **Frontend** | HTML5 Canvas, WebSocket API | Drawing & real-time UI |
| **Backend** | Node.js 20, Express | HTTP server, RAFT logic |
| **Transport** | WebSocket (WS), HTTP | Client & RAFT communication |
| **Container** | Docker, Docker Compose | Local dev environment |
| **Cloud** | AWS ECS, Fargate, ECR, Cloud Map | Production deployment |
| **Consensus** | Mini-RAFT (custom) | Distributed state replication |

---

## 🧪 Testing Checklist

- [ ] Draw stroke in one tab, appears in another
- [ ] Undo removes stroke, Redo restores it
- [ ] Kill leader via button, new leader elected
- [ ] Restart a replica automatically syncs log
- [ ] Dashboard shows real-time events
- [ ] Replica status updates in real-time
- [ ] WebSocket reconnects after network failure
- [ ] Multiple clients see identical canvas
- [ ] Connection persists through replica restarts

---

## 📝 For VIVA Preparation

See [GUIDE.md](GUIDE.md) for comprehensive coverage of:
- Every code segment explained
- All RAFT concepts with examples
- All cloud computing concepts
- Complete logic flow diagrams
- Viva Q&A section
- Common failure scenarios
- Performance considerations

---

## 👥 Team

Built by 4 CS engineers for Cloud Computing (CS366/CS369/CS913) assignment.

---

## 📄 License

Course assignment. Educational use only.


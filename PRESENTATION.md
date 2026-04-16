# Presentation Script — Distributed Real-Time Drawing Board

---

## INTRO (Anyone can say this)

"We built a distributed collaborative drawing board where multiple users can draw on the same canvas in real time. What makes it different from a normal drawing app is that instead of using a database or a message broker like Redis, we built our own consensus algorithm from scratch called Mini-RAFT. This ensures every user always sees the exact same drawing, even if one of our servers crashes while you're drawing."

"The system has three parts — the RAFT replica cluster, the WebSocket gateway, and the Docker infrastructure. Each of us owned one of these."

---

## PERSON 1 — RAFT Replicas (replica1 / replica2 / replica3)

"I built the core of the system — the three RAFT consensus nodes."

### What is RAFT?
"RAFT is a distributed consensus algorithm. The idea is simple — you have multiple servers, and they all need to agree on the same sequence of events. One server is elected as the Leader, and all writes go through it. The leader replicates every write to the other servers called Followers before confirming it as committed."

### Leader Election
"Each replica starts as a Follower with a random election timeout — between 500 and 800 milliseconds. If a follower doesn't hear from a leader within that time, it assumes the leader is dead and starts an election."

"It increments its term number, votes for itself, and sends RequestVote messages to the other two replicas. If it gets votes from at least 2 out of 3 nodes — a majority — it becomes the Leader."

"The randomized timeout is the key trick that prevents two nodes from starting elections at the same time and splitting votes."

### Heartbeats
"Once elected, the leader sends heartbeat messages every 150 milliseconds to all followers. This resets their election timers and tells them the leader is still alive. If the leader crashes, followers stop receiving heartbeats, their timers expire, and a new election starts automatically."

### Log Replication — How a Stroke Gets Committed
"When a user draws something, the stroke arrives at the leader via the /stroke endpoint. The leader appends it to its own log, then sends an AppendEntries request to both followers in parallel."

"It waits for at least one follower to acknowledge — giving us a majority of 2 out of 3. Only then does it mark the entry as committed and notify the gateway. This guarantees no stroke is ever lost even if one node crashes."

### Fault Tolerance Demo
"You can literally kill a running replica with docker stop and the system keeps working. The two surviving nodes have a majority, elect a new leader within about a second, and drawing continues. When the crashed node comes back, it syncs all the missed log entries from the current leader via the /sync-log endpoint."

### Key Endpoints
- `POST /stroke` — accepts a drawing stroke, replicates it via RAFT
- `POST /request-vote` — handles vote requests during elections
- `POST /append-entries` — receives log entries from the leader
- `POST /heartbeat` — keeps followers alive
- `GET /status` — returns current role, term, and log length
- `POST /crash` — simulates a node failure for demo purposes

---

## PERSON 2 — WebSocket Gateway (gateway/)

"I built the gateway — the single entry point between the browser and the RAFT cluster."

### What the Gateway Does
"The gateway is a stateless Node.js server running Express and the ws WebSocket library. Browsers connect to it via WebSocket. The gateway's job is to figure out who the current RAFT leader is and forward all drawing strokes to it."

### Leader Discovery
"The gateway polls all three replicas every 500 milliseconds by hitting their /status endpoint. Whichever one responds with role: leader is stored as the current leader URL. If the leader changes — because of a failover — the gateway automatically picks up the new one within half a second."

"Replicas also proactively notify the gateway when they win an election via the /leader-update endpoint, so discovery is near-instant in practice."

### Handling a Stroke
"When a user draws, the browser sends a WebSocket message of type stroke to the gateway. The gateway forwards it as an HTTP POST to the leader's /stroke endpoint."

"If the leader responds with a 307 redirect — meaning it's no longer the leader — the gateway immediately triggers a rediscovery. If the request fails entirely, it also clears the leader and rediscovers."

### Broadcasting Committed Strokes
"When the RAFT leader commits a stroke, it calls the gateway's /committed endpoint. The gateway adds it to an in-memory log and broadcasts it to all connected WebSocket clients. This is how every browser sees the stroke appear in real time."

### Reconnection and Replay
"If a browser disconnects and reconnects — say because of a network blip or a leader failover — the gateway immediately sends it the full committed log as a replay message. The canvas replays all strokes from scratch so the user sees the complete drawing."

### Key Endpoints
- `WebSocket /` — browser connection point
- `POST /committed` — receives committed strokes from the leader, broadcasts to all clients
- `POST /leader-update` — receives leader change notifications from replicas
- `POST /kill-leader` — demo endpoint to crash the current leader
- `GET /leader-status` — returns current leader info to the frontend status bar

---

## PERSON 3 — Docker Infrastructure (docker-compose.yml + Dockerfiles)

"I handled the containerization and infrastructure — making sure all four services can run together reliably with a single command."

### Docker Compose Overview
"We have four services defined in docker-compose.yml — replica1, replica2, replica3, and gateway. All of them run on a shared internal Docker network called raft-net with a bridge driver."

"This internal network is what allows the replicas to talk to each other using hostnames like replica1, replica2, replica3 instead of hardcoded IP addresses. Docker's internal DNS resolves these automatically."

### Replica Dockerfiles
"Each replica uses node:20-alpine as the base image — Alpine is a minimal Linux distro, keeps the image small. We install curl explicitly because Alpine doesn't include it by default, and we need it for the health checks."

"We also install nodemon which watches the source files for changes and restarts the node process automatically during development. The source code is mounted as a volume — ./replica1:/app/src — so any code change reflects immediately without rebuilding the image."

### Gateway Dockerfile
"The gateway is simpler — just node:20-alpine, copy the package.json, npm install, copy the source. The frontend files are served via a volume mount ./frontend:/app/frontend so the HTML and JS are available inside the container at runtime."

### Health Checks
"This is the important part. The gateway depends_on all three replicas with condition: service_healthy. This means Docker will not start the gateway until all three replicas pass their health checks."

"Each replica's health check runs curl -f http://localhost:300X/status every 5 seconds. It retries up to 5 times with a 10 second start period. This guarantees the RAFT cluster is fully up and a leader is elected before the gateway starts trying to discover one."

### Environment Variables
"All configuration is passed via environment variables — no hardcoded values in the code. REPLICA_ID tells each node its own name. PEER_URLS tells it the addresses of the other two nodes. GATEWAY_NOTIFY_URL tells it where to send leader election notifications."

"This makes the whole system portable — you can change ports or hostnames just by editing the compose file."

### Running It
```bash
docker-compose up --build
```
"That one command builds all four images and starts everything in the right order. Open http://localhost:8080 and you're drawing."

### Demo — Kill a Leader
```bash
docker stop mini_project-replica1-1
```
"Kill replica1 while drawing. Within about a second, replica2 or replica3 wins an election, the gateway discovers the new leader, and drawing continues without any data loss. Bring replica1 back with docker start and it syncs all missed strokes automatically."

---

## CLOSING (Anyone)

"The key takeaway is that we didn't use any external tools for consistency — no Redis, no Kafka, no Zookeeper. The RAFT algorithm itself guarantees that every stroke is ordered and replicated before it's shown to users. The drawing board is essentially a visual representation of a distributed log."

"You can open multiple browser tabs, draw from all of them simultaneously, kill servers, and the canvas stays consistent across all clients."

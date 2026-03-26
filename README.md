# Distributed Real-Time Drawing Board

## Project Overview
This project is a highly resilient, distributed collaborative drawing board. Instead of relying on a centralized database or standard message broker, it leverages a custom-built **Mini-RAFT consensus protocol** to ensure all drawing strokes are ordered, synchronized, and fault-tolerant across multiple server replicas.

---

## What Has Been Done So Far

1. **Custom RAFT Consensus Implementation (Node.js)**
   - Developed a 3-node replica cluster from scratch that handles Leader Election, Heartbeats, and Log Replication (`AppendEntries`).
   - Built automatic failover logic. If the leader goes offline, the remaining followers immediately elect a new leader.
   - Synchronizes stragglers/reconnected nodes (followers sync missed entries from the current leader).

2. **WebSocket Gateway Routing Layer**
   - Created a stateless Gateway server that dynamically discovers the current RAFT leader.
   - Handles real-time dual-way communication (via WebSockets) between the browser clients and the backend cluster.
   - Automatically buffers and routes new drawing strokes to the active leader.

3. **Browser-Based Canvas Frontend**
   - Implemented an HTML5 Canvas drawing surface.
   - Robust WebSocket reconnection logic that re-fetches committed strokes to redraw the canvas seamlessly if the connection is dropped or a failover occurs.

4. **Containerized Infrastructure**
   - Fully dockerized architecture using Docker Compose.
   - Features internal DNS/networking (`raft-net`) and isolated environments for replicas and the gateway.
   - Implemented health checks (via `curl` directly inside the Alpine images) ensuring dependent services wait until replicas are fully operational.

---

## How Unique Is This Project?

Most real-time drawing applications simply use a WebSocket server broadcasting state (like Socket.io rooms) or lean on an existing Pub/Sub cache like Redis. 

**This project stands out because:**
1. **Low-Level Distributed Systems Focus:** Writing a custom RAFT consensus algorithm in JavaScript instead of relying on external orchestration tools is a profound demonstration of distributed systems engineering.
2. **Event Sourcing with Consensus:** A drawing board is the perfect visual representation of the RAFT log. Each "stroke" is a state transition. Because of the Strict Consistency provided by RAFT, it is impossible for two connected users to permanently see different version of the drawing, mitigating race conditions entirely.
3. **True Fault Tolerance Demonstration:** You can physically kill active containers (`docker stop ...`) while users are drawing, and the system dynamically absorbs the failure and continues drawing correctly without data loss—a rare feature in student or mini-projects.

---

## What Else Can Be Done (Future Enhancements)

While perfectly functional and adhering to the core problem statement, here are ways to expand and improve the system:

1. **Persistent Storage (Disk Logging)**
   - *Current State:* The RAFT log is held strictly in RAM (`let state = { log: [] }`). If the entire cluster is shut down, the drawing is lost.
   - *Enhancement:* Write the stroke logs to the disk (e.g., appending to a simple `.json` file line-by-line or using minimal SQLite) so drawings survive full cluster restarts.

2. **Log Compaction / Snapshotting**
   - *Current State:* The drawing log grows infinitely as long as the server is running.
   - *Enhancement:* Implement RAFT snapshotting. Once the log reaches a certain size, compress the current canvas state into a single image or snapshot matrix, and discard the old stroke history to save memory and speed up syncing for new clients.

3. **Drawing Features & Undo/Redo**
   - *Enhancement:* Allow users to pick colors or brush sizes. 
   - *Enhancement:* Since we are using an Event Sourced RAFT log, implementing a "Global Undo" feature simply means deleting the last log entry and broadcasting a truncate command!

4. **Dynamic Cluster Membership**
   - *Enhancement:* Modify the protocol to support adding a 4th or 5th replica dynamically without having to edit the `docker-compose.yml` and restart the network.

5. **Load Testing & Benchmarking**
   - *Enhancement:* Create a script that generates thousands of random strokes locally to prove the performance and limits of the Node.js RAFT implementation under heavy load.

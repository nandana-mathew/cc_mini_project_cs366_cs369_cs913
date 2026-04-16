# Distributed Real-Time Drawing Board

A collaborative drawing board built on a custom **Mini-RAFT consensus protocol** — no Redis, no Socket.io rooms, no external message brokers. Just raw distributed systems engineering in Node.js.

---

## What It Does

Multiple users can draw on a shared canvas in real-time. Every stroke is treated as a log entry in a RAFT consensus cluster, guaranteeing that all connected users always see the same drawing — even if a server crashes mid-session.

---

## Architecture

```
Browser (Canvas) <--WebSocket--> Gateway <--HTTP--> Replica1 (RAFT Node)
                                                 \-> Replica2 (RAFT Node)
                                                 \-> Replica3 (RAFT Node)
```

- **3 RAFT Replicas** — elect a leader, replicate strokes as log entries, handle failover automatically
- **Gateway** — stateless WebSocket server that discovers the current leader and routes strokes to it
- **Frontend** — HTML5 Canvas with WebSocket reconnection and full replay on reconnect

---

## How to Run (Local)

Make sure Docker is running, then:

```bash
docker-compose up --build
```

Open `http://localhost:8080` in your browser.

To test fault tolerance — kill a replica while drawing:
```bash
docker stop mini_project-replica1-1
```

The remaining two nodes elect a new leader and drawing continues without data loss.

---

## AWS Deployment (ECS + Fargate)

We deployed this on AWS using ECS Fargate with ECR for container images and Cloud Map for internal DNS between services.

### Steps We Followed

**1. Push images to ECR**
```bash
aws ecr create-repository --repository-name raft-gateway --region us-east-1
aws ecr create-repository --repository-name raft-replica1 --region us-east-1
aws ecr create-repository --repository-name raft-replica2 --region us-east-1
aws ecr create-repository --repository-name raft-replica3 --region us-east-1

aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com

docker build -t raft-gateway -f gateway/Dockerfile .
docker tag raft-gateway:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/raft-gateway:latest
docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/raft-gateway:latest

# repeat for replica1, replica2, replica3
```

**2. Create ECS cluster**
```bash
aws ecs create-cluster --cluster-name raft-cluster --region us-east-1
```

**3. Create IAM execution role**
```bash
aws iam create-role --role-name ecsTaskExecutionRole --assume-role-policy-document file://ecs/trust-policy.json
aws iam attach-role-policy --role-name ecsTaskExecutionRole --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
```

**4. Create Cloud Map namespace for internal DNS**
```bash
aws servicediscovery create-private-dns-namespace --name raft.local --vpc <vpc-id> --region us-east-1

# Create a service entry for each replica and gateway
aws servicediscovery create-service --name replica1 --dns-config "NamespaceId=<ns-id>,DnsRecords=[{Type=A,TTL=10}]" --region us-east-1
# repeat for replica2, replica3, gateway
```

**5. Register task definitions**
```bash
aws ecs register-task-definition --cli-input-json file://ecs/replica1-task.json --region us-east-1
aws ecs register-task-definition --cli-input-json file://ecs/replica2-task.json --region us-east-1
aws ecs register-task-definition --cli-input-json file://ecs/replica3-task.json --region us-east-1
aws ecs register-task-definition --cli-input-json file://ecs/gateway-task.json --region us-east-1
```

**6. Create ECS services**
```bash
aws ecs create-service --cli-input-json file://ecs/replica1-service.json --region us-east-1
aws ecs create-service --cli-input-json file://ecs/replica2-service.json --region us-east-1
aws ecs create-service --cli-input-json file://ecs/replica3-service.json --region us-east-1
aws ecs create-service --cli-input-json file://ecs/gateway-service.json --region us-east-1
```

**7. Get the public IP of the gateway task**
```bash
aws ecs list-tasks --cluster raft-cluster --service-name gateway --region us-east-1
aws ecs describe-tasks --cluster raft-cluster --tasks <task-arn> --query "tasks[0].attachments[0].details[?name=='networkInterfaceId'].value" --output text --region us-east-1
aws ec2 describe-network-interfaces --network-interface-ids <eni-id> --query "NetworkInterfaces[0].Association.PublicIp" --output text --region us-east-1
```

App is accessible at `http://<public-ip>:8080`

---

## Key Design Decisions

- **RAFT over Redis/Kafka** — consensus is implemented from scratch, not delegated to an external tool
- **Event sourcing** — each stroke is a state transition in the log; the canvas is fully reproducible by replaying the log
- **Stateless gateway** — the gateway holds no authoritative state, making it trivially replaceable
- **Internal DNS via Cloud Map** — replicas discover each other by name (`replica1.raft.local`) not hardcoded IPs

---

## Project Structure

```
├── frontend/         # HTML5 canvas + WebSocket client
├── gateway/          # Express + WebSocket gateway server
├── replica1/         # RAFT node 1
├── replica2/         # RAFT node 2
├── replica3/         # RAFT node 3
├── ecs/              # AWS ECS task and service definitions
├── docker-compose.yml
└── README.md
```

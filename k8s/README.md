# ☸️ Bookdrop Kubernetes Architecture (k8s)

This directory contains production-style Kubernetes manifests for orchestrating the **Bookdrop API** with declarative state management, automated rolling updates, and self-healing health probes.

---

## Architecture Overview

```
                      [ Host Browser ]
                             │
                             ▼ (http://localhost:8080)
┌────────────────────────────────────────────────────────────┐
│  Kubernetes Service (NodePort: 30080 -> 3000)              │
│  - Name: bookdrop-service                                  │
└────────────────────────────┬───────────────────────────────┘
                             │
              Load Balances Across 2 Replicas
              ┌──────────────┴──────────────┐
              ▼                             ▼
┌───────────────────────────┐ ┌───────────────────────────┐
│  Pod: bookdrop-api-xxxx   │ │  Pod: bookdrop-api-yyyy   │
│  - Container: NestJS API  │ │  - Container: NestJS API  │
│  - User: non-root (node)  │ │  - User: non-root (node)  │
│  - Liveness: /health/live │ │  - Liveness: /health/live │
│  - Readiness: /health/ready│ │ - Readiness: /health/ready│
└─────────────┬─────────────┘ └─────────────┬─────────────┘
              │                             │
              └──────────────┬──────────────┘
                             │ (Internal DNS: postgres-service:5432)
                             ▼
┌────────────────────────────────────────────────────────────┐
│  Pod: postgres (postgres:16)                               │
│  - Service: postgres-service (ClusterIP: 5432)             │
│  - Secrets: bookdrop-secrets                               │
└────────────────────────────────────────────────────────────┘
```

---

## Manifest Inventory

| Manifest | Kind | Purpose |
| :--- | :--- | :--- |
| [`kind-config.yaml`](kind-config.yaml) | `Cluster` | Configures local Kubernetes cluster port mapping (Host `8080` $\rightarrow$ NodePort `30080`). |
| [`namespace.yaml`](namespace.yaml) | `Namespace` | Isolates all Bookdrop workloads under `bookdrop`. |
| [`secrets.yaml`](secrets.yaml) | `Secret` | Stores sensitive environment variables (Database URL, JWT keys). |
| [`postgres.yaml`](postgres.yaml) | `Deployment` & `Service` | Runs PostgreSQL 16 with internal `pg_isready` readiness & liveness probes. |
| [`migration-job.yaml`](migration-job.yaml) | `Job` | Runs a one-off batch pod executing Prisma schema migrations and catalog seed. |
| [`deployment.yaml`](deployment.yaml) | `Deployment` | Runs **2 replicas** of the Bookdrop API with rolling updates and HTTP probes. |
| [`service.yaml`](service.yaml) | `Service` | Exposes the API internally and binds port 3000 to NodePort 30080. |

---

## Quickstart Guide

### 1. Create the Cluster
```bash
kind create cluster --config k8s/kind-config.yaml
kind load docker-image bookdrop-api:latest --name bookdrop-cluster
```

### 2. Apply Manifests
```bash
# 1. Namespace & Secrets
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/secrets.yaml

# 2. Database
kubectl apply -f k8s/postgres.yaml

# 3. Wait for DB readiness, then run Migrations & Seed Job
kubectl wait --namespace bookdrop --for=condition=ready pod -l app=postgres --timeout=60s
kubectl apply -f k8s/migration-job.yaml
kubectl wait --namespace bookdrop --for=condition=complete job/bookdrop-migration-seed --timeout=90s

# 4. Deploy API and Service
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
```

### 3. Verify in Browser
Open in your browser:
* **Liveness:** [http://localhost:8080/health/live](http://localhost:8080/health/live)
* **Readiness:** [http://localhost:8080/health/ready](http://localhost:8080/health/ready)
* **GraphQL:** [http://localhost:8080/graphql](http://localhost:8080/graphql)

---

## Everyday Kubernetes Cheatsheet

```bash
# List all pods and services in the bookdrop namespace
kubectl get pods -n bookdrop
kubectl get services -n bookdrop

# Stream live logs from all API pods simultaneously
kubectl logs -n bookdrop -l app=bookdrop-api -f

# Scale up from 2 to 5 replicas dynamically
kubectl scale deployment bookdrop-api -n bookdrop --replicas=5

# Inspect a pod's lifecycle and healthcheck events
kubectl describe pod <pod-name> -n bookdrop

# Clean up / Delete the local cluster
kind delete cluster --name bookdrop-cluster
```

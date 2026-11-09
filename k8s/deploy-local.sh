#!/usr/bin/env bash
# =============================================================================
# k8s/deploy-local.sh — Bookdrop Federated Supergraph local deployment
# =============================================================================
# Prerequisites:
#   - Kind cluster running: kind create cluster --config k8s/kind-config.yaml --name bookdrop-cluster
#   - Docker Desktop / Docker daemon running
#   - kubectl pointing to the Kind cluster context
#
# Usage:
#   bash k8s/deploy-local.sh
# =============================================================================
set -euo pipefail

NAMESPACE=bookdrop
CLUSTER_NAME=bookdrop-cluster
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║   Bookdrop — Federated Supergraph Local Deployment   ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# ── Step 1: Build Docker images ──────────────────────────────────────────────
echo "▶ [1/7] Building Docker images..."
docker build -t bookdrop-api:k8s-local "$ROOT_DIR"
docker build -t identity-service:k8s-local "$ROOT_DIR/services/identity-service"
docker build -t gateway:k8s-local "$ROOT_DIR/services/gateway"
docker build -t notifications-service:k8s-local "$ROOT_DIR/services/notifications-service"
echo "   ✓ Images built"

# ── Step 2: Load images into Kind cluster (Kind can't pull from Docker Hub by default) ─
echo "▶ [2/7] Loading images into Kind cluster '$CLUSTER_NAME'..."
kind load docker-image bookdrop-api:k8s-local          --name "$CLUSTER_NAME"
kind load docker-image identity-service:k8s-local      --name "$CLUSTER_NAME"
kind load docker-image gateway:k8s-local               --name "$CLUSTER_NAME"
kind load docker-image notifications-service:k8s-local --name "$CLUSTER_NAME"
echo "   ✓ Images loaded"

# ── Step 3: Apply namespace + infrastructure ──────────────────────────────────
echo "▶ [3/7] Applying namespace and infrastructure manifests..."
kubectl apply -f "$ROOT_DIR/k8s/namespace.yaml"
kubectl apply -f "$ROOT_DIR/k8s/secrets.yaml"
kubectl apply -f "$ROOT_DIR/k8s/postgres.yaml"
kubectl apply -f "$ROOT_DIR/k8s/rabbitmq.yaml"

echo "   Waiting for Postgres to be ready..."
kubectl rollout status deployment/postgres -n "$NAMESPACE" --timeout=120s

echo "   Waiting for RabbitMQ to be ready..."
kubectl rollout status deployment/rabbitmq -n "$NAMESPACE" --timeout=120s
echo "   ✓ Infrastructure ready"

# ── Step 4: Run database migrations & seed ───────────────────────────────────
echo "▶ [4/7] Running database migration + seed job..."
kubectl delete job bookdrop-migration-seed -n "$NAMESPACE" --ignore-not-found
kubectl apply -f "$ROOT_DIR/k8s/migration-job.yaml"
kubectl wait --for=condition=complete job/bookdrop-migration-seed \
  -n "$NAMESPACE" --timeout=120s
echo "   ✓ Migrations & seed complete"

# ── Step 5: Hand over port 30080 from monolith to gateway ────────────────────
echo "▶ [5/7] Transitioning from monolith to federated gateway..."
# Scale monolith to 0 replicas (keeps Deployment object for rollback if needed)
kubectl scale deployment/bookdrop-api --replicas=0 -n "$NAMESPACE" --ignore-not-found 2>/dev/null || true
# Delete the monolith NodePort service so gateway can claim port 30080
kubectl delete service bookdrop-service -n "$NAMESPACE" --ignore-not-found 2>/dev/null || true
echo "   ✓ Monolith scaled down and service deleted"

# ── Step 6: Deploy microservices ─────────────────────────────────────────────
echo "▶ [6/7] Deploying microservices..."

echo "   Deploying identity-service..."
kubectl apply -f "$ROOT_DIR/k8s/identity-deployment.yaml"

echo "   Deploying library-core..."
kubectl apply -f "$ROOT_DIR/k8s/library-core-deployment.yaml"

echo "   Deploying notifications-service..."
kubectl apply -f "$ROOT_DIR/k8s/notifications-deployment.yaml"

echo "   Waiting for identity-service rollout..."
kubectl rollout status deployment/identity-service -n "$NAMESPACE" --timeout=180s

echo "   Waiting for library-core rollout..."
kubectl rollout status deployment/library-core -n "$NAMESPACE" --timeout=180s

echo "   Deploying gateway (supergraph router)..."
kubectl apply -f "$ROOT_DIR/k8s/gateway-deployment.yaml"
kubectl rollout status deployment/gateway -n "$NAMESPACE" --timeout=180s
echo "   ✓ All microservices deployed"

# ── Step 7: Metrics-server + HPA ─────────────────────────────────────────────
echo "▶ [7/7] Installing metrics-server and applying HPA..."
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml

# Patch metrics-server to skip TLS verification (required for Kind)
kubectl patch deployment metrics-server -n kube-system \
  --type='json' \
  -p='[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--kubelet-insecure-tls"}]' 2>/dev/null || true

kubectl apply -f "$ROOT_DIR/k8s/hpa.yaml"
echo "   ✓ HPA configured (library-core: min=2, max=5)"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════"
echo "✅ Bookdrop Federated Supergraph deployed successfully!"
echo "════════════════════════════════════════════════════════"
echo ""
echo "   GraphQL Playground:  http://localhost:8080/graphql"
echo "   Health Check:        http://localhost:8080/health"
echo ""
echo "   Pod status:"
kubectl get pods -n "$NAMESPACE" -o wide
echo ""
echo "   HPA status:"
kubectl get hpa -n "$NAMESPACE"
echo ""
echo "   Smoke test:"
echo "     curl -s http://localhost:8080/health | python3 -m json.tool"


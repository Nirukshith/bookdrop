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
echo "╔════════════════════════════════════════════════════════════════════════╗"
echo "║   Bookdrop — Federated Supergraph, Ingress & Observability Deploy     ║"
echo "╚════════════════════════════════════════════════════════════════════════╝"
echo ""

# ── Step 1: Build Docker images ──────────────────────────────────────────────
echo "▶ [1/8] Building Docker images..."
docker build -t bookdrop-api:k8s-local "$ROOT_DIR"
docker build -t identity-service:k8s-local "$ROOT_DIR/services/identity-service"
docker build -t gateway:k8s-local "$ROOT_DIR/services/gateway"
docker build -t notifications-service:k8s-local "$ROOT_DIR/services/notifications-service"
docker build -t bookdrop-web:k8s-local "$ROOT_DIR/web"
echo "   ✓ All 5 images built"

# ── Step 2: Load images into Kind cluster ─────────────────────────────────────
echo "▶ [2/8] Loading images into Kind cluster '$CLUSTER_NAME'..."
kind load docker-image bookdrop-api:k8s-local          --name "$CLUSTER_NAME"
kind load docker-image identity-service:k8s-local      --name "$CLUSTER_NAME"
kind load docker-image gateway:k8s-local               --name "$CLUSTER_NAME"
kind load docker-image notifications-service:k8s-local --name "$CLUSTER_NAME"
kind load docker-image bookdrop-web:k8s-local          --name "$CLUSTER_NAME"
echo "   ✓ Images loaded"

# ── Step 3: Apply namespace + infrastructure ──────────────────────────────────
echo "▶ [3/8] Applying namespace, database, message broker & Jaeger..."
kubectl apply -f "$ROOT_DIR/k8s/namespace.yaml"
kubectl apply -f "$ROOT_DIR/k8s/secrets.yaml"
kubectl apply -f "$ROOT_DIR/k8s/postgres.yaml"
kubectl apply -f "$ROOT_DIR/k8s/rabbitmq.yaml"
kubectl apply -f "$ROOT_DIR/k8s/jaeger.yaml"

echo "   Waiting for Postgres..."
kubectl rollout status deployment/postgres -n "$NAMESPACE" --timeout=180s

echo "   Waiting for RabbitMQ..."
kubectl rollout status deployment/rabbitmq -n "$NAMESPACE" --timeout=180s

echo "   Waiting for Jaeger..."
kubectl rollout status deployment/jaeger -n "$NAMESPACE" --timeout=180s
echo "   ✓ Infrastructure ready"

# ── Step 4: Run database migrations & seed ───────────────────────────────────
echo "▶ [4/8] Running database migration + seed job..."
kubectl delete job bookdrop-migration-seed -n "$NAMESPACE" --ignore-not-found
kubectl apply -f "$ROOT_DIR/k8s/migration-job.yaml"
kubectl wait --for=condition=complete job/bookdrop-migration-seed \
  -n "$NAMESPACE" --timeout=120s
echo "   ✓ Migrations & seed complete"

# ── Step 5: Transition from monolith ─────────────────────────────────────────
echo "▶ [5/8] Transitioning from monolith to federated stack..."
kubectl scale deployment/bookdrop-api --replicas=0 -n "$NAMESPACE" --ignore-not-found 2>/dev/null || true
kubectl delete service bookdrop-service -n "$NAMESPACE" --ignore-not-found 2>/dev/null || true
echo "   ✓ Monolith scaled down"

# ── Step 6: Deploy microservices & web frontend ──────────────────────────────
echo "▶ [6/8] Deploying microservices, gateway & web frontend..."

echo "   Deploying identity-service..."
kubectl apply -f "$ROOT_DIR/k8s/identity-deployment.yaml"

echo "   Deploying library-core..."
kubectl apply -f "$ROOT_DIR/k8s/library-core-deployment.yaml"

echo "   Deploying notifications-service..."
kubectl apply -f "$ROOT_DIR/k8s/notifications-deployment.yaml"

echo "   Waiting for subgraphs..."
kubectl rollout status deployment/identity-service -n "$NAMESPACE" --timeout=180s
kubectl rollout status deployment/library-core -n "$NAMESPACE" --timeout=180s

echo "   Deploying Apollo Gateway..."
kubectl apply -f "$ROOT_DIR/k8s/gateway-deployment.yaml"
kubectl rollout status deployment/gateway -n "$NAMESPACE" --timeout=180s

echo "   Deploying Web Frontend (Next.js 14)..."
kubectl apply -f "$ROOT_DIR/k8s/web-deployment.yaml"
kubectl rollout status deployment/web -n "$NAMESPACE" --timeout=180s
echo "   ✓ All application services deployed"

# ── Step 7: NGINX Ingress Controller & Routing Rules ─────────────────────────
echo "▶ [7/8] Installing NGINX Ingress Controller and applying routing rules..."
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml

echo "   Waiting for Ingress controller..."
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=180s 2>/dev/null || true

kubectl apply -f "$ROOT_DIR/k8s/ingress.yaml"
echo "   ✓ Ingress rules active"

# ── Step 8: Metrics-server + HPA ─────────────────────────────────────────────
echo "▶ [8/8] Installing metrics-server and applying HPA..."
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml

kubectl patch deployment metrics-server -n kube-system \
  --type='json' \
  -p='[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--kubelet-insecure-tls"}]' 2>/dev/null || true

kubectl apply -f "$ROOT_DIR/k8s/hpa.yaml"
echo "   ✓ HPA active"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════════════════════"
echo "✅ Bookdrop Enterprise Supergraph, Web & Ingress deployed successfully!"
echo "════════════════════════════════════════════════════════════════════════"
echo ""
echo "   Web Portal:             http://app.bookdrop.local"
echo "   GraphQL Supergraph:     http://api.bookdrop.local/graphql"
echo "   Distributed Traces:     http://tracing.bookdrop.local"
echo "   Direct NodePort (Alt):  http://localhost:8080/graphql"
echo "   Gateway Health:         http://localhost:8080/health"
echo ""
echo "   💡 Add these local DNS entries to /etc/hosts for browser access:"
echo "      127.0.0.1  app.bookdrop.local api.bookdrop.local tracing.bookdrop.local"
echo ""
echo "   Pod status:"
kubectl get pods -n "$NAMESPACE" -o wide
echo ""
echo "   Ingress status:"
kubectl get ingress -n "$NAMESPACE"

#!/usr/bin/env bash
# =============================================================================
# Bookdrop AWS On-Demand Scaler: Stop Script (aws-down.sh)
#
# Idempotently stops the Bookdrop AWS environment in exact reverse order:
#   1. Set ECS service desired count to 0 and wait until tasks stop.
#   2. Stop App Host: Scale ASG to 0 or stop EC2 instance (wait for stopped).
#   3. Stop RDS PostgreSQL (skip if already stopped).
#   4. Print a reminder that RDS restarts automatically after 7 days if left stopped.
#
# NOTE ON AUTO SCALING GROUPS VS DIRECT INSTANCE STOPS:
# If an EC2 instance is managed by an Auto Scaling Group (ASG), you MUST scale
# the ASG (setting min-size and desired-capacity to 0) rather than stopping the
# instance directly. When an ASG instance is stopped directly, the ASG health check
# marks the stopped instance as unhealthy and automatically terminates and replaces
# it with a new running instance, defeating cost-saving intents.
# For Bookdrop, our Step 1 inspection confirmed a standalone EC2 host instance
# (i-070c77c1d322f9550), which is safely started and stopped directly.
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TERRAFORM_DIR="${REPO_ROOT}/terraform"

DRY_RUN=false
for arg in "$@"; do
  case "$arg" in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [--dry-run]"
      echo "Stops Bookdrop AWS infrastructure on-demand (ECS -> EC2 -> RDS)."
      exit 0
      ;;
  esac
done

echo "====================================================================="
echo "  Stopping Bookdrop AWS Infrastructure On-Demand"
if [ "$DRY_RUN" = true ]; then
  echo "  Mode: [DRY-RUN] (No AWS resource changes will be applied)"
fi
echo "====================================================================="

# Read configuration from Terraform output or fallback
TF_OUTPUTS="{}"
if [ -d "$TERRAFORM_DIR" ] && command -v terraform >/dev/null 2>&1; then
  echo "[INFO] Reading configuration from Terraform outputs..."
  TF_OUTPUTS=$(terraform -chdir="$TERRAFORM_DIR" output -json 2>/dev/null || echo "{}")
fi

get_tf_val() {
  local key="$1"
  local fallback="$2"
  python3 -c "import sys, json
try:
    data = json.load(sys.stdin)
    val = data.get('$key', {}).get('value', '')
    print(val if val != '' else '$fallback')
except Exception:
    print('$fallback')
" <<< "$TF_OUTPUTS"
}

REGION="${AWS_REGION:-$(get_tf_val 'region' 'ap-south-1')}"
CLUSTER="${ECS_CLUSTER:-$(get_tf_val 'ecs_cluster_name' 'bookdrop-cluster')}"
SERVICE="${ECS_SERVICE:-$(get_tf_val 'ecs_service_name' 'bookdrop-api-service')}"
EC2_INSTANCE_ID="${EC2_INSTANCE_ID:-$(get_tf_val 'ec2_instance_id' 'i-070c77c1d322f9550')}"
ASG_NAME="${ASG_NAME:-$(get_tf_val 'asg_name' '')}"
RDS_IDENTIFIER="${RDS_IDENTIFIER:-$(get_tf_val 'rds_instance_identifier' 'bookdrop-db')}"

echo "[INFO] Target Region:         $REGION"
echo "[INFO] ECS Cluster / Service: $CLUSTER / $SERVICE"
echo "[INFO] App Host:              EC2=$EC2_INSTANCE_ID ${ASG_NAME:+ASG=$ASG_NAME}"
echo "[INFO] RDS DB Identifier:     $RDS_IDENTIFIER"
echo "---------------------------------------------------------------------"

# -----------------------------------------------------------------------------
# 1. Scale ECS service desired count to 0
# -----------------------------------------------------------------------------
echo "[STEP 1/3] Scaling ECS service to desired_count=0 ($SERVICE)..."
CURRENT_DESIRED=$(aws ecs describe-services \
  --cluster "$CLUSTER" \
  --services "$SERVICE" \
  --region "$REGION" \
  --query "services[0].desiredCount" \
  --output text 2>/dev/null || echo "0")

CURRENT_RUNNING=$(aws ecs describe-services \
  --cluster "$CLUSTER" \
  --services "$SERVICE" \
  --region "$REGION" \
  --query "services[0].runningCount" \
  --output text 2>/dev/null || echo "0")

echo "[INFO] Current ECS service counts: desired=$CURRENT_DESIRED, running=$CURRENT_RUNNING"

if [ "$CURRENT_DESIRED" -eq 0 ] && [ "$CURRENT_RUNNING" -eq 0 ]; then
  echo "[INFO] ECS service is already stopped (desired=0, running=0)."
else
  if [ "$DRY_RUN" = true ]; then
    echo "[DRY-RUN] Would execute: aws ecs update-service --cluster $CLUSTER --service $SERVICE --desired-count 0"
    echo "[DRY-RUN] Would wait for running tasks to reach 0."
  else
    echo "[INFO] Setting ECS service desired count to 0..."
    aws ecs update-service \
      --cluster "$CLUSTER" \
      --service "$SERVICE" \
      --desired-count 0 \
      --region "$REGION" >/dev/null
    
    echo "[INFO] Waiting for running tasks to reach 0..."
    MAX_WAIT=24
    WAIT_COUNT=0
    while [ $WAIT_COUNT -lt $MAX_WAIT ]; do
      RUNNING=$(aws ecs describe-services \
        --cluster "$CLUSTER" \
        --services "$SERVICE" \
        --region "$REGION" \
        --query "services[0].runningCount" \
        --output text 2>/dev/null || echo "0")
      if [ "$RUNNING" -eq 0 ]; then
        echo "[SUCCESS] All ECS service tasks have terminated."
        break
      fi
      WAIT_COUNT=$((WAIT_COUNT + 1))
      echo "[WAIT] Active tasks remaining: $RUNNING. Waiting... ($WAIT_COUNT/$MAX_WAIT)"
      sleep 5
    done
  fi
fi

# -----------------------------------------------------------------------------
# 2. Stop App Host (Scale ASG to 0 or Stop EC2 Instance)
# -----------------------------------------------------------------------------
echo "---------------------------------------------------------------------"
echo "[STEP 2/3] Stopping App Host..."

if [ -n "$ASG_NAME" ]; then
  echo "[INFO] Managing Auto Scaling Group: $ASG_NAME"
  if [ "$DRY_RUN" = true ]; then
    echo "[DRY-RUN] Would scale ASG $ASG_NAME to min=0, desired=0"
  else
    aws autoscaling update-auto-scaling-group \
      --auto-scaling-group-name "$ASG_NAME" \
      --min-size 0 \
      --desired-capacity 0 \
      --region "$REGION"
    echo "[SUCCESS] Scaled ASG $ASG_NAME to 0."
  fi
elif [ -n "$EC2_INSTANCE_ID" ]; then
  EC2_STATE=$(aws ec2 describe-instances \
    --instance-ids "$EC2_INSTANCE_ID" \
    --region "$REGION" \
    --query "Reservations[0].Instances[0].State.Name" \
    --output text 2>/dev/null || echo "unknown")
  echo "[INFO] Current EC2 State for $EC2_INSTANCE_ID: $EC2_STATE"

  if [ "$EC2_STATE" = "stopped" ]; then
    echo "[INFO] EC2 instance is already stopped."
  elif [ "$EC2_STATE" = "stopping" ]; then
    if [ "$DRY_RUN" = true ]; then
      echo "[DRY-RUN] EC2 instance is already stopping. Would wait for 'stopped' state."
    else
      echo "[INFO] EC2 instance is currently stopping. Waiting for 'stopped' state..."
      aws ec2 wait instance-stopped --instance-ids "$EC2_INSTANCE_ID" --region "$REGION"
      echo "[SUCCESS] EC2 instance is now stopped."
    fi
  elif [ "$EC2_STATE" = "running" ]; then
    if [ "$DRY_RUN" = true ]; then
      echo "[DRY-RUN] Would execute: aws ec2 stop-instances --instance-ids $EC2_INSTANCE_ID"
      echo "[DRY-RUN] Would wait for instance-stopped state."
    else
      echo "[INFO] Stopping EC2 instance ($EC2_INSTANCE_ID)..."
      aws ec2 stop-instances --instance-ids "$EC2_INSTANCE_ID" --region "$REGION" >/dev/null
      echo "[INFO] Waiting for EC2 instance to enter 'stopped' state..."
      aws ec2 wait instance-stopped --instance-ids "$EC2_INSTANCE_ID" --region "$REGION"
      echo "[SUCCESS] EC2 instance is stopped."
    fi
  else
    echo "[WARN] EC2 instance in unexpected state: $EC2_STATE"
  fi
fi

# -----------------------------------------------------------------------------
# 3. Stop RDS PostgreSQL Instance
# -----------------------------------------------------------------------------
echo "---------------------------------------------------------------------"
echo "[STEP 3/3] Checking RDS PostgreSQL DB instance status ($RDS_IDENTIFIER)..."
RDS_STATUS=$(aws rds describe-db-instances \
  --db-instance-identifier "$RDS_IDENTIFIER" \
  --region "$REGION" \
  --query "DBInstances[0].DBInstanceStatus" \
  --output text 2>/dev/null || echo "unknown")

echo "[INFO] Current RDS Status: $RDS_STATUS"

if [ "$RDS_STATUS" = "stopped" ]; then
  echo "[INFO] RDS DB instance is already stopped."
elif [ "$RDS_STATUS" = "stopping" ]; then
  echo "[INFO] RDS DB instance is already transitioning to stopped."
elif [ "$RDS_STATUS" = "available" ]; then
  if [ "$DRY_RUN" = true ]; then
    echo "[DRY-RUN] Would execute: aws rds stop-db-instance --db-instance-identifier $RDS_IDENTIFIER"
  else
    echo "[INFO] Stopping RDS DB instance ($RDS_IDENTIFIER)..."
    aws rds stop-db-instance --db-instance-identifier "$RDS_IDENTIFIER" --region "$REGION" >/dev/null
    echo "[SUCCESS] RDS DB instance stop initiated."
  fi
else
  echo "[WARN] RDS DB instance is in '$RDS_STATUS' state; cannot stop until available."
fi

echo ""
echo "---------------------------------------------------------------------"
echo "  [WARNING / COST NOTICE]"
echo "  Amazon RDS will automatically restart after 7 consecutive days"
echo "  if left in a stopped state. Check periodically or run aws-down.sh again."
echo "---------------------------------------------------------------------"

# -----------------------------------------------------------------------------
# Current State Summary
# -----------------------------------------------------------------------------
echo "====================================================================="
echo "  Current Bookdrop Resource State Summary"
echo "====================================================================="
FINAL_RDS=$(aws rds describe-db-instances --db-instance-identifier "$RDS_IDENTIFIER" --region "$REGION" --query "DBInstances[0].DBInstanceStatus" --output text 2>/dev/null || echo "unknown")
FINAL_EC2=$(aws ec2 describe-instances --instance-ids "$EC2_INSTANCE_ID" --region "$REGION" --query "Reservations[0].Instances[0].State.Name" --output text 2>/dev/null || echo "unknown")
FINAL_ECS=$(aws ecs describe-services --cluster "$CLUSTER" --services "$SERVICE" --region "$REGION" --query "services[0].{Desired:desiredCount, Running:runningCount}" --output text 2>/dev/null || echo "unknown")

echo "  RDS ($RDS_IDENTIFIER):          Status = $FINAL_RDS"
echo "  EC2 Host ($EC2_INSTANCE_ID):     State  = $FINAL_EC2"
echo "  ECS Service ($SERVICE):       $FINAL_ECS"
echo "====================================================================="
echo "[ALL DONE] Bookdrop compute and database resources have been stopped."

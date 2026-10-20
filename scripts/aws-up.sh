#!/usr/bin/env bash
# =============================================================================
# Bookdrop AWS On-Demand Scaler: Start Script (aws-up.sh)
#
# Idempotently starts the Bookdrop AWS environment in exact order:
#   1. Start RDS PostgreSQL (skip if already available), then wait until available.
#   2. Start App Host: Start EC2 instance (or scale ASG) and wait for ECS registration.
#   3. Set ECS service desired count to 1 and wait until service is stable.
#   4. Poll health URL (/health/ready) until HTTP 200 or timeout with error.
#
# NOTE ON AUTO SCALING GROUPS VS DIRECT INSTANCE STOPS:
# If an EC2 instance is managed by an Auto Scaling Group (ASG), you MUST scale
# the ASG (setting min-size and desired-capacity) rather than stopping the
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
      echo "Starts Bookdrop AWS infrastructure on-demand (RDS -> EC2 -> ECS -> Health Poll)."
      exit 0
      ;;
  esac
done

echo "====================================================================="
echo "  Starting Bookdrop AWS Infrastructure On-Demand"
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
HEALTH_URL="${HEALTH_URL:-$(get_tf_val 'public_health_url' 'http://bookdrop-alb-1343440666.ap-south-1.elb.amazonaws.com/health/ready')}"

echo "[INFO] Target Region:         $REGION"
echo "[INFO] RDS DB Identifier:     $RDS_IDENTIFIER"
echo "[INFO] App Host:              EC2=$EC2_INSTANCE_ID ${ASG_NAME:+ASG=$ASG_NAME}"
echo "[INFO] ECS Cluster / Service: $CLUSTER / $SERVICE"
echo "[INFO] Health Check URL:      $HEALTH_URL"
echo "---------------------------------------------------------------------"

# -----------------------------------------------------------------------------
# 1. Start RDS (skip if already available)
# -----------------------------------------------------------------------------
echo "[STEP 1/4] Checking RDS DB instance status ($RDS_IDENTIFIER)..."
RDS_STATUS=$(aws rds describe-db-instances \
  --db-instance-identifier "$RDS_IDENTIFIER" \
  --region "$REGION" \
  --query "DBInstances[0].DBInstanceStatus" \
  --output text)

echo "[INFO] Current RDS Status: $RDS_STATUS"

if [ "$RDS_STATUS" = "available" ]; then
  echo "[INFO] RDS PostgreSQL is already available. Skipping start."
elif [ "$RDS_STATUS" = "stopped" ]; then
  if [ "$DRY_RUN" = true ]; then
    echo "[DRY-RUN] Would execute: aws rds start-db-instance --db-instance-identifier $RDS_IDENTIFIER"
    echo "[DRY-RUN] Would wait for RDS instance to become available."
  else
    echo "[INFO] Starting RDS DB instance ($RDS_IDENTIFIER)..."
    aws rds start-db-instance --db-instance-identifier "$RDS_IDENTIFIER" --region "$REGION" >/dev/null
    echo "[INFO] Waiting for RDS instance to become available (this may take 2-4 minutes)..."
    aws rds wait db-instance-available --db-instance-identifier "$RDS_IDENTIFIER" --region "$REGION"
    echo "[SUCCESS] RDS instance is now available."
  fi
elif [ "$RDS_STATUS" = "starting" ]; then
  if [ "$DRY_RUN" = true ]; then
    echo "[DRY-RUN] RDS is already starting. Would wait for it to become available."
  else
    echo "[INFO] RDS is currently starting. Waiting for available status..."
    aws rds wait db-instance-available --db-instance-identifier "$RDS_IDENTIFIER" --region "$REGION"
    echo "[SUCCESS] RDS instance is now available."
  fi
else
  echo "[WARN] RDS is in '$RDS_STATUS' state. Waiting for available..."
  if [ "$DRY_RUN" = false ]; then
    aws rds wait db-instance-available --db-instance-identifier "$RDS_IDENTIFIER" --region "$REGION"
  fi
fi

# -----------------------------------------------------------------------------
# 2. Start App Host (EC2 instance or ASG) and wait for ECS registration
# -----------------------------------------------------------------------------
echo "---------------------------------------------------------------------"
echo "[STEP 2/4] Starting App Host & verifying ECS cluster registration..."

if [ -n "$ASG_NAME" ]; then
  echo "[INFO] Managing Auto Scaling Group: $ASG_NAME"
  if [ "$DRY_RUN" = true ]; then
    echo "[DRY-RUN] Would scale ASG $ASG_NAME: min=1, desired=1"
  else
    aws autoscaling update-auto-scaling-group \
      --auto-scaling-group-name "$ASG_NAME" \
      --min-size 1 \
      --desired-capacity 1 \
      --region "$REGION"
    echo "[INFO] Scaled ASG $ASG_NAME to desired=1."
  fi
elif [ -n "$EC2_INSTANCE_ID" ]; then
  EC2_STATE=$(aws ec2 describe-instances \
    --instance-ids "$EC2_INSTANCE_ID" \
    --region "$REGION" \
    --query "Reservations[0].Instances[0].State.Name" \
    --output text)
  echo "[INFO] Current EC2 State for $EC2_INSTANCE_ID: $EC2_STATE"

  if [ "$EC2_STATE" = "running" ]; then
    echo "[INFO] EC2 instance is already running."
  elif [ "$EC2_STATE" = "stopped" ]; then
    if [ "$DRY_RUN" = true ]; then
      echo "[DRY-RUN] Would execute: aws ec2 start-instances --instance-ids $EC2_INSTANCE_ID"
      echo "[DRY-RUN] Would wait for instance-running and ECS registration."
    else
      echo "[INFO] Starting EC2 host instance ($EC2_INSTANCE_ID)..."
      aws ec2 start-instances --instance-ids "$EC2_INSTANCE_ID" --region "$REGION" >/dev/null
      echo "[INFO] Waiting for EC2 instance to enter 'running' state..."
      aws ec2 wait instance-running --instance-ids "$EC2_INSTANCE_ID" --region "$REGION"
      echo "[SUCCESS] EC2 instance is running."
    fi
  elif [ "$EC2_STATE" = "pending" ]; then
    if [ "$DRY_RUN" = false ]; then
      echo "[INFO] EC2 instance is pending. Waiting for running state..."
      aws ec2 wait instance-running --instance-ids "$EC2_INSTANCE_ID" --region "$REGION"
    fi
  fi
fi

# Wait for ECS container instance registration
if [ "$DRY_RUN" = true ]; then
  echo "[DRY-RUN] Would wait for EC2 host to register with ECS cluster ($CLUSTER)."
else
  echo "[INFO] Waiting for EC2 host to register with ECS cluster ($CLUSTER)..."
  MAX_RETRIES=30
  RETRY=0
  REGISTERED=false
  while [ $RETRY -lt $MAX_RETRIES ]; do
    CONTAINER_INSTANCE_ARN=$(aws ecs list-container-instances \
      --cluster "$CLUSTER" \
      --region "$REGION" \
      --filter "ec2InstanceId == '$EC2_INSTANCE_ID'" \
      --query "containerInstanceArns[0]" \
      --output text 2>/dev/null || true)
    
    if [ -n "$CONTAINER_INSTANCE_ARN" ] && [ "$CONTAINER_INSTANCE_ARN" != "None" ]; then
      CI_STATUS=$(aws ecs describe-container-instances \
        --cluster "$CLUSTER" \
        --container-instances "$CONTAINER_INSTANCE_ARN" \
        --region "$REGION" \
        --query "containerInstances[0].status" \
        --output text 2>/dev/null || echo "INACTIVE")
      
      if [ "$CI_STATUS" = "ACTIVE" ]; then
        echo "[SUCCESS] Container instance registered with ECS: $CONTAINER_INSTANCE_ARN (Status: ACTIVE)"
        REGISTERED=true
        break
      fi
    fi

    RETRY=$((RETRY + 1))
    echo "[WAIT] ECS agent registering... (attempt $RETRY/$MAX_RETRIES)"
    sleep 5
  done

  if [ "$REGISTERED" = false ]; then
    echo "[ERROR] Timed out waiting for EC2 instance $EC2_INSTANCE_ID to register with ECS cluster $CLUSTER"
    exit 1
  fi
fi

# -----------------------------------------------------------------------------
# 3. Set ECS service desired count to 1 and wait until service is stable
# -----------------------------------------------------------------------------
echo "---------------------------------------------------------------------"
echo "[STEP 3/4] Scaling ECS service to desired_count=1 ($SERVICE)..."

if [ "$DRY_RUN" = true ]; then
  echo "[DRY-RUN] Would execute: aws ecs update-service --cluster $CLUSTER --service $SERVICE --desired-count 1"
  echo "[DRY-RUN] Would execute: aws ecs wait services-stable --cluster $CLUSTER --services $SERVICE"
else
  aws ecs update-service \
    --cluster "$CLUSTER" \
    --service "$SERVICE" \
    --desired-count 1 \
    --region "$REGION" >/dev/null
  echo "[INFO] Scaled desired count to 1. Waiting for ECS service to stabilize..."
  aws ecs wait services-stable \
    --cluster "$CLUSTER" \
    --services "$SERVICE" \
    --region "$REGION"
  echo "[SUCCESS] ECS service $SERVICE is stable with desired_count=1."
fi

# -----------------------------------------------------------------------------
# 4. Poll health check URL (/health/ready)
# -----------------------------------------------------------------------------
echo "---------------------------------------------------------------------"
echo "[STEP 4/4] Polling public readiness endpoint ($HEALTH_URL)..."

if [ "$DRY_RUN" = true ]; then
  echo "[DRY-RUN] Would poll $HEALTH_URL until HTTP 200 is returned."
else
  MAX_HEALTH_POLLS=36
  POLL=0
  HEALTHY=false
  while [ $POLL -lt $MAX_HEALTH_POLLS ]; do
    POLL=$((POLL + 1))
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$HEALTH_URL" 2>/dev/null || echo "000")
    if [ "$HTTP_CODE" = "200" ]; then
      echo "[SUCCESS] Health check passed! Endpoint returned HTTP 200 OK."
      HEALTHY=true
      break
    else
      echo "[WAIT] Readiness check returned HTTP $HTTP_CODE. Retrying in 5s... ($POLL/$MAX_HEALTH_POLLS)"
      sleep 5
    fi
  done

  if [ "$HEALTHY" = false ]; then
    echo "[ERROR] Timed out waiting for $HEALTH_URL to return HTTP 200 OK after $((MAX_HEALTH_POLLS * 5)) seconds."
    exit 1
  fi
fi

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
echo "[ALL DONE] Bookdrop is fully up and running on AWS!"

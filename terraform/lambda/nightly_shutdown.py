import os
import boto3
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def handler(event, context):
    region = os.environ.get("TARGET_REGION", os.environ.get("AWS_REGION", "ap-south-1"))
    cluster = os.environ.get("ECS_CLUSTER", "bookdrop-cluster")
    service = os.environ.get("ECS_SERVICE", "bookdrop-api-service")
    instance_id = os.environ.get("EC2_INSTANCE_ID", "i-070c77c1d322f9550")
    rds_id = os.environ.get("RDS_IDENTIFIER", "bookdrop-db")

    ecs = boto3.client("ecs", region_name=region)
    ec2 = boto3.client("ec2", region_name=region)
    rds = boto3.client("rds", region_name=region)

    logger.info("Initiating nightly shutdown safety net...")

    # 1. Scale ECS service desired count to 0
    try:
        logger.info(f"Stopping ECS service {service} in cluster {cluster}...")
        ecs.update_service(cluster=cluster, service=service, desiredCount=0)
        logger.info("ECS service set to desired_count=0.")
    except Exception as e:
        logger.error(f"Failed to scale ECS service: {e}")

    # 2. Stop EC2 host instance
    try:
        logger.info(f"Stopping EC2 host instance {instance_id}...")
        ec2.stop_instances(InstanceIds=[instance_id])
        logger.info(f"EC2 stop requested for {instance_id}.")
    except Exception as e:
        logger.error(f"Failed to stop EC2 instance: {e}")

    # 3. Stop RDS PostgreSQL instance (if available)
    try:
        logger.info(f"Checking RDS instance {rds_id}...")
        dbs = rds.describe_db_instances(DBInstanceIdentifier=rds_id)
        status = dbs["DBInstances"][0]["DBInstanceStatus"]
        logger.info(f"RDS status: {status}")
        if status == "available":
            rds.stop_db_instance(DBInstanceIdentifier=rds_id)
            logger.info(f"RDS stop requested for {rds_id}.")
        else:
            logger.info(f"RDS instance is in '{status}' status; skipping stop.")
    except Exception as e:
        logger.error(f"Failed to stop RDS DB instance: {e}")

    return {
        "statusCode": 200,
        "body": "Nightly shutdown sequence successfully executed."
    }

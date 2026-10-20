output "region" {
  description = "AWS region"
  value       = var.aws_region
}

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = "bookdrop-cluster"
}

output "ecs_service_name" {
  description = "ECS service name"
  value       = aws_ecs_service.bookdrop_api_service.name
}

output "ec2_instance_id" {
  description = "EC2 host instance ID (standalone EC2 host)"
  value       = "i-070c77c1d322f9550"
}

output "asg_name" {
  description = "Auto Scaling Group name (empty if standalone EC2 host)"
  value       = ""
}

output "rds_instance_identifier" {
  description = "RDS DB instance identifier"
  value       = "bookdrop-db"
}

output "public_health_url" {
  description = "Public readiness health check URL"
  value       = "http://bookdrop-alb-1343440666.ap-south-1.elb.amazonaws.com/health/ready"
}

provider "aws" {
  region = var.aws_region
}

# -----------------------------------------------------------------------------
# Existing Resource Declarations & Imports
# -----------------------------------------------------------------------------
import {
  to = aws_cloudwatch_log_group.bookdrop_api
  id = "/ecs/bookdrop-api"
}

import {
  to = aws_ecr_lifecycle_policy.bookdrop_api
  id = "bookdrop-api"
}

import {
  to = aws_ecs_service.bookdrop_api_service
  id = "bookdrop-cluster/bookdrop-api-service"
}

# -----------------------------------------------------------------------------
# CloudWatch Log Group
# -----------------------------------------------------------------------------
resource "aws_cloudwatch_log_group" "bookdrop_api" {
  name              = "/ecs/bookdrop-api"
  retention_in_days = var.log_retention_days
}

# -----------------------------------------------------------------------------
# ECR Lifecycle Policy (Keep 10 most recent images)
# -----------------------------------------------------------------------------
resource "aws_ecr_lifecycle_policy" "bookdrop_api" {
  repository = "bookdrop-api"

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep the ${var.ecr_image_count} most recent images"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = var.ecr_image_count
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}

# -----------------------------------------------------------------------------
# ECS Service with lifecycle ignore_changes for desired_count
# -----------------------------------------------------------------------------
resource "aws_ecs_service" "bookdrop_api_service" {
  name                               = "bookdrop-api-service"
  cluster                            = "arn:aws:ecs:ap-south-1:060668531381:cluster/bookdrop-cluster"
  task_definition                    = "bookdrop-api-task:1"
  desired_count                      = 1
  launch_type                        = "EC2"
  scheduling_strategy                = "REPLICA"
  deployment_maximum_percent         = 100
  deployment_minimum_healthy_percent = 0
  health_check_grace_period_seconds  = 0
  enable_ecs_managed_tags            = false
  propagate_tags                     = "NONE"

  deployment_circuit_breaker {
    enable   = false
    rollback = false
  }

  deployment_controller {
    type = "ECS"
  }

  load_balancer {
    target_group_arn = "arn:aws:elasticloadbalancing:ap-south-1:060668531381:targetgroup/bookdrop-tg/6539f45270c0fdb0"
    container_name   = "bookdrop-api"
    container_port   = 3000
  }

  lifecycle {
    ignore_changes = [
      desired_count,
      task_definition
    ]
  }
}

# -----------------------------------------------------------------------------
# AWS Budgets Alarm (50%, 80%, 100%)
# -----------------------------------------------------------------------------
resource "aws_budgets_budget" "monthly_budget" {
  name              = "bookdrop-monthly-budget"
  budget_type       = "COST"
  limit_amount      = var.monthly_budget_amount
  limit_unit        = "USD"
  time_unit         = "MONTHLY"
  time_period_start = "2026-01-01_00:00"

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 50
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = var.budget_notification_emails
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = var.budget_notification_emails
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = var.budget_notification_emails
  }
}

# =============================================================================
# Step 5: EventBridge Scheduler Nightly Shutdown Safety Net
# =============================================================================

data "archive_file" "nightly_shutdown_zip" {
  type        = "zip"
  source_file = "${path.module}/lambda/nightly_shutdown.py"
  output_path = "${path.module}/lambda/nightly_shutdown.zip"
}

# -----------------------------------------------------------------------------
# Lambda Execution Role & Policy
# -----------------------------------------------------------------------------
resource "aws_iam_role" "nightly_shutdown_lambda_role" {
  count = var.enable_nightly_stop_schedule ? 1 : 0
  name  = "bookdrop-nightly-shutdown-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_policy" "nightly_shutdown_policy" {
  count       = var.enable_nightly_stop_schedule ? 1 : 0
  name        = "bookdrop-nightly-shutdown-policy"
  description = "Allows Lambda to stop ECS service, EC2 host instance, and RDS PostgreSQL"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "CloudWatchLogs"
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        Sid    = "StopECS"
        Effect = "Allow"
        Action = [
          "ecs:UpdateService",
          "ecs:DescribeServices"
        ]
        Resource = "*"
      },
      {
        Sid    = "StopEC2"
        Effect = "Allow"
        Action = [
          "ec2:StopInstances",
          "ec2:DescribeInstances"
        ]
        Resource = "*"
      },
      {
        Sid    = "StopRDS"
        Effect = "Allow"
        Action = [
          "rds:StopDBInstance",
          "rds:DescribeDBInstances"
        ]
        Resource = "*"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "nightly_shutdown_attach" {
  count      = var.enable_nightly_stop_schedule ? 1 : 0
  role       = aws_iam_role.nightly_shutdown_lambda_role[0].name
  policy_arn = aws_iam_policy.nightly_shutdown_policy[0].arn
}

# -----------------------------------------------------------------------------
# Nightly Shutdown Lambda Function
# -----------------------------------------------------------------------------
resource "aws_lambda_function" "nightly_shutdown" {
  count            = var.enable_nightly_stop_schedule ? 1 : 0
  function_name    = "bookdrop-nightly-shutdown"
  role             = aws_iam_role.nightly_shutdown_lambda_role[0].arn
  handler          = "nightly_shutdown.handler"
  runtime          = "python3.11"
  filename         = data.archive_file.nightly_shutdown_zip.output_path
  source_code_hash = data.archive_file.nightly_shutdown_zip.output_base64sha256
  timeout          = 30

  environment {
    variables = {
      AWS_REGION       = var.aws_region
      ECS_CLUSTER      = "bookdrop-cluster"
      ECS_SERVICE      = "bookdrop-api-service"
      EC2_INSTANCE_ID  = "i-070c77c1d322f9550"
      RDS_IDENTIFIER   = "bookdrop-db"
    }
  }
}

# -----------------------------------------------------------------------------
# EventBridge Scheduler Execution Role & Schedule
# -----------------------------------------------------------------------------
resource "aws_iam_role" "scheduler_role" {
  count = var.enable_nightly_stop_schedule ? 1 : 0
  name  = "bookdrop-nightly-scheduler-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "scheduler.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy" "scheduler_invoke_lambda" {
  count = var.enable_nightly_stop_schedule ? 1 : 0
  name  = "bookdrop-scheduler-invoke-lambda"
  role  = aws_iam_role.scheduler_role[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action   = "lambda:InvokeFunction"
        Effect   = "Allow"
        Resource = aws_lambda_function.nightly_shutdown[0].arn
      }
    ]
  })
}

resource "aws_scheduler_schedule" "nightly_shutdown" {
  count                        = var.enable_nightly_stop_schedule ? 1 : 0
  name                         = "bookdrop-nightly-shutdown-schedule"
  description                  = "Automated nightly shutdown safety net for Bookdrop AWS resources"
  schedule_expression          = var.nightly_stop_schedule
  schedule_expression_timezone = var.nightly_stop_timezone

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = aws_lambda_function.nightly_shutdown[0].arn
    role_arn = aws_iam_role.scheduler_role[0].arn
  }
}

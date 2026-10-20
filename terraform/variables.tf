variable "aws_region" {
  description = "AWS region for deployment"
  type        = string
  default     = "ap-south-1"
}

variable "log_retention_days" {
  description = "CloudWatch log retention period in days"
  type        = number
  default     = 14
}

variable "ecr_image_count" {
  description = "Number of recent ECR images to keep"
  type        = number
  default     = 10
}

variable "monthly_budget_amount" {
  description = "Monthly budget limit in USD"
  type        = string
  default     = "15.0"
}

variable "budget_notification_emails" {
  description = "List of email addresses for budget alert notifications"
  type        = list(string)
  default     = ["nirukshith2002@gmail.com"]
}

variable "enable_nightly_stop_schedule" {
  description = "Enable automated nightly stop sequence via EventBridge Scheduler"
  type        = bool
  default     = true
}

variable "nightly_stop_schedule" {
  description = "Cron expression for nightly shutdown schedule"
  type        = string
  default     = "cron(0 23 * * ? *)" # 11:00 PM nightly
}

variable "nightly_stop_timezone" {
  description = "Timezone for EventBridge Scheduler schedule"
  type        = string
  default     = "Asia/Kolkata"
}

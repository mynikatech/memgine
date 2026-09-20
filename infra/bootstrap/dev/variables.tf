variable "aws_profile" {
  type        = string
  description = "AWS IAM Identity Center profile used for bootstrap."
  default     = "memgine"
}

variable "aws_region" {
  type        = string
  description = "AWS region for the Memgine DEV state bucket."
  default     = "ca-central-1"
}

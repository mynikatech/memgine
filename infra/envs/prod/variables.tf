variable "aws_profile" {
  type        = string
  description = "Memgine infrastructure AWS CLI profile."
  default     = "memgine"
}

variable "aws_region" {
  type    = string
  default = "ca-central-1"
}

variable "dns_aws_profile" {
  type    = string
  default = "ApnaFundAdmin"
}

variable "dns_aws_region" {
  type    = string
  default = "ap-south-1"
}

variable "app_name" {
  type    = string
  default = "memgine"
}

variable "environment" {
  type    = string
  default = "prod"
}

variable "hosted_zone_name" {
  type    = string
  default = "mynikatech.in"
}

variable "frontend_domain" {
  type    = string
  default = "memgine.mynikatech.in"
}

variable "api_domain" {
  type    = string
  default = "api-memgine.mynikatech.in"
}

variable "instance_type" {
  type = string
}

variable "db_instance_class" {
  type = string
}

variable "db_engine_version" {
  type = string
}

variable "db_name" {
  type    = string
  default = "memgine_prod"
}

variable "db_master_username" {
  type    = string
  default = "memgine_admin"
}

variable "db_allocated_storage_gb" {
  type = number
}

variable "db_max_allocated_storage_gb" {
  type = number
}

variable "db_backup_retention_days" {
  type = number
}

variable "db_deletion_protection" {
  type = bool
}

variable "db_skip_final_snapshot" {
  type = bool
}

variable "additional_secret_arns" {
  type        = list(string)
  default     = []
  description = "Existing production Secrets Manager secret ARNs needed by the runtime."
}

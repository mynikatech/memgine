variable "aws_profile" {
  type    = string
  default = "memgine"
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
  default = "dev"
}

variable "hosted_zone_name" {
  type    = string
  default = "mynikatech.in"
}

variable "frontend_domain" {
  type    = string
  default = "memgine-dev.mynikatech.in"
}

variable "api_domain" {
  type    = string
  default = "api-memgine-dev.mynikatech.in"
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
  default = "memgine_dev"
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
variable "resend_from_email" {
  type    = string
  default = "support@mynikatech.in"
}

variable "meta_phone_number_id" {
  type = string
}

variable "meta_graph_api_version" {
  type    = string
  default = "v22.0"
}

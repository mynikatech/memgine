variable "aws_profile" {
  type    = string
  default = "memgine"
}

variable "aws_region" {
  type    = string
  default = "ca-central-1"
}

variable "app_name" {
  type    = string
  default = "memgine"
}

variable "environment" {
  type    = string
  default = "dev"
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
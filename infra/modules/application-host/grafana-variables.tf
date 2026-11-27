variable "grafana_logging_managed" {
  type        = bool
  default     = false
  description = "Provision Grafana logging resources. Keep true when disabling an existing collector."
}

variable "grafana_logging_enabled" {
  type        = bool
  default     = false
  description = "Start or stop Memgine-managed Alloy forwarding through SSM."
}

variable "grafana_loki_url" {
  type        = string
  default     = ""
  description = "Non-secret HTTPS Loki push URL."
  validation {
    condition     = var.grafana_loki_url == "" || can(regex("^https://[a-zA-Z0-9.-]+/loki/api/v1/push$", var.grafana_loki_url))
    error_message = "Use an HTTPS Loki push URL without credentials or query parameters."
  }
}

variable "grafana_loki_username" {
  type        = string
  default     = ""
  description = "Non-secret Loki tenant ID."
  validation {
    condition     = var.grafana_loki_username == "" || can(regex("^[0-9]+$", var.grafana_loki_username))
    error_message = "Loki tenant ID must contain only digits."
  }
}

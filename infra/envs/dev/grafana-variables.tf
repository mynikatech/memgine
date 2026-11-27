variable "grafana_logging_managed" {
  type    = bool
  default = true
}

variable "grafana_logging_enabled" {
  type    = bool
  default = false
}

variable "grafana_loki_url" {
  type    = string
  default = "https://logs-prod-018.grafana.net/loki/api/v1/push"
}

variable "grafana_loki_username" {
  type    = string
  default = "1900151"
}

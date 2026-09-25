provider "aws" {
  profile = var.aws_profile
  region  = var.aws_region
}

provider "aws" {
  alias   = "dns"
  profile = var.dns_aws_profile
  region  = var.dns_aws_region
}

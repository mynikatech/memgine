output "state_bucket_name" { value = aws_s3_bucket.state.bucket }
output "state_bucket_arn" { value = aws_s3_bucket.state.arn }
output "region" { value = var.aws_region }

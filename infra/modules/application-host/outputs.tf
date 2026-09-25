output "vpc_id" {
  value = aws_vpc.this.id
}

output "public_subnet_id" {
  value = aws_subnet.public.id
}

output "ec2_instance_id" {
  value = aws_instance.app.id
}

output "ec2_role_arn" {
  value = aws_iam_role.ec2.arn
}

output "elastic_ip" {
  value = aws_eip.app.public_ip
}

output "deploy_bucket_name" {
  value = aws_s3_bucket.deploy.bucket
}

output "deploy_bucket_arn" {
  value = aws_s3_bucket.deploy.arn
}

output "app_data_bucket_name" {
  value = aws_s3_bucket.app_data.bucket
}

output "app_data_bucket_arn" {
  value = aws_s3_bucket.app_data.arn
}

output "database_endpoint" {
  value = aws_db_instance.postgres.address
}

output "database_port" {
  value = aws_db_instance.postgres.port
}

output "database_master_secret_arn" {
  value     = aws_db_instance.postgres.master_user_secret[0].secret_arn
  sensitive = true
}

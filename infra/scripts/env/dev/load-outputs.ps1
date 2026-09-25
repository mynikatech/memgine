$instance = terraform -chdir=infra/envs/dev output -raw app_ec2_instance_id
$rds = terraform -chdir=infra/envs/dev output -raw app_database_endpoint
$master = terraform -chdir=infra/envs/dev output -raw app_database_master_secret_arn
$liquibase = terraform -chdir=infra/envs/dev output -raw app_database_liquibase_secret_arn
$runtime = terraform -chdir=infra/envs/dev output -raw app_database_runtime_secret_arn

Write-Host "Memgine DEV Terraform outputs loaded."
Write-Host "EC2 Instance : $instance"
Write-Host "RDS Endpoint : $rds"
Write-Host "Sensitive secret ARNs loaded into variables but not displayed."
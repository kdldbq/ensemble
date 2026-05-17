###############################################################################
# ensemble — Terraform module for AWS deploy
#
# Provisions:
#   - RDS Postgres (db.t4g.small default)
#   - ElastiCache Redis (cache.t4g.micro default)
#   - Then `helm_release` deploys ensemble against an EXISTING EKS cluster
#
# Prereqs:
#   - VPC + subnets already in your AWS account (passed via vars)
#   - EKS cluster + kubeconfig configured locally
#   - terraform >=1.5, AWS provider 5.x, helm provider 2.x
#
# Usage:
#   terraform init
#   terraform apply -var-file=production.tfvars
###############################################################################

terraform {
  required_version = ">= 1.5"
  required_providers {
    aws  = { source = "hashicorp/aws", version = "~> 5.0" }
    helm = { source = "hashicorp/helm", version = "~> 2.0" }
  }
}

provider "aws" {
  region = var.region
}

provider "helm" {
  kubernetes {
    config_path    = var.kubeconfig_path
    config_context = var.kube_context
  }
}

###############################################################################
# Variables
###############################################################################
variable "region" {
  type    = string
  default = "us-east-1"
}

variable "vpc_id" {
  type        = string
  description = "Existing VPC id where RDS + ElastiCache will live"
}

variable "subnet_ids" {
  type        = list(string)
  description = "Private subnet ids for the DB subnet groups"
}

variable "allowed_security_group_ids" {
  type        = list(string)
  description = "SG ids that may connect to Postgres + Redis (typically the EKS node SG)"
}

variable "db_password" {
  type      = string
  sensitive = true
}

variable "kubeconfig_path" {
  type    = string
  default = "~/.kube/config"
}

variable "kube_context" {
  type    = string
  default = ""
}

variable "namespace" {
  type    = string
  default = "ensemble"
}

variable "ingress_host" {
  type        = string
  description = "Hostname for the Ingress (e.g. ensemble.example.com)"
}

variable "ingress_tls_secret" {
  type    = string
  default = ""
}

variable "server_image_tag" {
  type    = string
  default = "latest"
}

variable "web_image_tag" {
  type    = string
  default = "latest"
}

###############################################################################
# RDS Postgres
###############################################################################
resource "aws_db_subnet_group" "ensemble" {
  name       = "ensemble-db-subnet"
  subnet_ids = var.subnet_ids
  tags       = { app = "ensemble" }
}

resource "aws_security_group" "ensemble_db" {
  name        = "ensemble-db-sg"
  description = "ensemble Postgres ingress"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = var.allowed_security_group_ids
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { app = "ensemble" }
}

resource "aws_db_instance" "ensemble" {
  identifier                = "ensemble"
  engine                    = "postgres"
  engine_version            = "16.3"
  instance_class            = "db.t4g.small"
  allocated_storage         = 20
  storage_type              = "gp3"
  storage_encrypted         = true
  db_name                   = "ensemble"
  username                  = "postgres"
  password                  = var.db_password
  db_subnet_group_name      = aws_db_subnet_group.ensemble.name
  vpc_security_group_ids    = [aws_security_group.ensemble_db.id]
  backup_retention_period   = 7
  backup_window             = "03:00-04:00"
  maintenance_window        = "Mon:04:00-Mon:05:00"
  deletion_protection       = true
  skip_final_snapshot       = false
  final_snapshot_identifier = "ensemble-final-snapshot"
  tags                      = { app = "ensemble" }
}

###############################################################################
# ElastiCache Redis
###############################################################################
resource "aws_elasticache_subnet_group" "ensemble" {
  name       = "ensemble-redis-subnet"
  subnet_ids = var.subnet_ids
}

resource "aws_security_group" "ensemble_redis" {
  name        = "ensemble-redis-sg"
  description = "ensemble Redis ingress"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = var.allowed_security_group_ids
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_elasticache_cluster" "ensemble" {
  cluster_id           = "ensemble"
  engine               = "redis"
  engine_version       = "7.1"
  node_type            = "cache.t4g.micro"
  num_cache_nodes      = 1
  parameter_group_name = "default.redis7"
  port                 = 6379
  subnet_group_name    = aws_elasticache_subnet_group.ensemble.name
  security_group_ids   = [aws_security_group.ensemble_redis.id]
  tags                 = { app = "ensemble" }
}

###############################################################################
# Helm release — deploys server + web + ingress
###############################################################################
resource "helm_release" "ensemble" {
  name             = "ensemble"
  chart            = "${path.module}/../helm"
  namespace        = var.namespace
  create_namespace = true

  set {
    name  = "postgres.url"
    value = "postgres://postgres:${var.db_password}@${aws_db_instance.ensemble.address}:5432/ensemble"
  }
  set {
    name  = "redis.url"
    value = "redis://${aws_elasticache_cluster.ensemble.cache_nodes[0].address}:6379"
  }
  set {
    name  = "ingress.host"
    value = var.ingress_host
  }
  set {
    name  = "image.server.tag"
    value = var.server_image_tag
  }
  set {
    name  = "image.web.tag"
    value = var.web_image_tag
  }
  dynamic "set" {
    for_each = var.ingress_tls_secret != "" ? [1] : []
    content {
      name  = "ingress.tls.enabled"
      value = "true"
    }
  }
  dynamic "set" {
    for_each = var.ingress_tls_secret != "" ? [1] : []
    content {
      name  = "ingress.tls.secretName"
      value = var.ingress_tls_secret
    }
  }
}

###############################################################################
# Outputs
###############################################################################
output "postgres_endpoint" {
  value     = aws_db_instance.ensemble.address
  sensitive = true
}

output "redis_endpoint" {
  value = aws_elasticache_cluster.ensemble.cache_nodes[0].address
}

output "ingress_host" {
  value = var.ingress_host
}

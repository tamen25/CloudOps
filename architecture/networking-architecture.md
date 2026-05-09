<!-- This document explains networking architecture for CloudOps. -->
# Network Architecture Diagram

Create a VPC with 10.0.0.0/16 in us-east-1 across 2 availability zones.

**Public Subnets** (10.0.0.0/24, 10.0.1.0/24):
- Internet Gateway
- ALB
- NAT Gateways

**Private Subnets** (10.0.10.0/24, 10.0.11.0/24):
- ECS Tasks

**Database Subnets** (10.0.20.0/24, 10.0.21.0/24):
- RDS PostgreSQL

**Traffic Flow**:
Internet → Internet Gateway → ALB → ECS → RDS

# Order API

Production-ready Node.js REST API for order processing with CloudWatch metrics integration.

## Features

- **Health Check Endpoint** (`GET /health`) - Used by ALB target group health checks
- **Order Creation** (`POST /order`) - Creates orders and publishes CloudWatch metrics
- **Order Statistics** (`GET /orders`) - Returns order processing statistics
- **CloudWatch Integration** - Custom metrics published to `CloudOps/OrderAPI` namespace
- **Container Health Checks** - Built-in Docker health check
- **Graceful Shutdown** - Handles SIGTERM/SIGINT signals

## API Endpoints

### GET /health
Health check endpoint for load balancer.

**Response:**
```json
{
  "status": "ok",
  "region": "us-east-1",
  "environment": "dev",
  "timestamp": "2025-12-31T15:30:00.000Z",
  "uptime": 3600.5,
  "orderCount": 42
}
```

### POST /order
Create a new order.

**Request:**
```json
{
  "items": [
    { "id": "item-1", "quantity": 2 }
  ],
  "total": 199.99
}
```

**Response:**
```json
{
  "success": true,
  "order": {
    "orderId": "ORD-1735659000000-abc123xyz",
    "timestamp": "2025-12-31T15:30:00.000Z",
    "environment": "dev",
    "region": "us-east-1",
    "items": [...],
    "total": 199.99
  },
  "message": "Order created successfully"
}
```

### GET /orders
Get order processing statistics.

**Response:**
```json
{
  "totalOrders": 42,
  "environment": "dev",
  "region": "us-east-1",
  "timestamp": "2025-12-31T15:30:00.000Z"
}
```

## Local Development

### Prerequisites
- Node.js 20+
- Docker (for containerized testing)

### Install Dependencies
```bash
cd apps/order-api
npm install
```

### Run Locally
```bash
npm start
```

The API will be available at `http://localhost:3000`

### Test Health Endpoint
```bash
curl http://localhost:3000/health
```

### Create Test Order
```bash
curl -X POST http://localhost:3000/order \
  -H "Content-Type: application/json" \
  -d '{"items":[{"id":"test","quantity":1}],"total":99.99}'
```

## Docker Build and Run

### Build Image
```bash
cd apps/order-api
docker build -t order-api:latest .
```

### Run Container Locally
```bash
docker run -p 3000:3000 \
  -e NODE_ENV=dev \
  -e AWS_REGION=us-east-1 \
  -e PORT=3000 \
  order-api:latest
```

### Test Container
```bash
curl http://localhost:3000/health
```

## Deploy to ECS

### 1. Get ECR Repository URL
```bash
terraform output -raw ecr_repo_url
# Example output: 123456789012.dkr.ecr.us-east-1.amazonaws.com/cloudops-dev-app
```

### 2. Login to ECR
```bash
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 123456789012.dkr.ecr.us-east-1.amazonaws.com
```

### 3. Build and Tag Image
```bash
cd apps/order-api
docker build -t order-api:v1.0.0 .
docker tag order-api:v1.0.0 123456789012.dkr.ecr.us-east-1.amazonaws.com/cloudops-dev-app:v1.0.0
```

### 4. Push to ECR
```bash
docker push 123456789012.dkr.ecr.us-east-1.amazonaws.com/cloudops-dev-app:v1.0.0
```

### 5. Update Terraform Configuration
Edit `terraform.tfvars`:
```hcl
container_image = "123456789012.dkr.ecr.us-east-1.amazonaws.com/cloudops-dev-app:v1.0.0"
container_port  = 3000
```

### 6. Deploy with Terraform
```bash
terraform apply
```

The ECS service will perform a rolling deployment with the new image.

## Updating the Image (Rolling Deployment)

To deploy a new version:

1. **Build new version:**
   ```bash
   docker build -t order-api:v1.1.0 .
   docker tag order-api:v1.1.0 123456789012.dkr.ecr.us-east-1.amazonaws.com/cloudops-dev-app:v1.1.0
   docker push 123456789012.dkr.ecr.us-east-1.amazonaws.com/cloudops-dev-app:v1.1.0
   ```

2. **Update terraform.tfvars:**
   ```hcl
   container_image = "123456789012.dkr.ecr.us-east-1.amazonaws.com/cloudops-dev-app:v1.1.0"
   ```

3. **Apply changes:**
   ```bash
   terraform apply
   ```

ECS will automatically:
- Start new tasks with v1.1.0
- Wait for health checks to pass
- Drain connections from old tasks
- Stop old tasks
- Zero-downtime deployment!

## Load Testing

Use the load generation script to test autoscaling:

```bash
# Get ALB DNS name
ALB_DNS=$(terraform output -raw alb_dns_name)

# Run load test (default: 10 workers, 20 QPS, 60 seconds)
node scripts/generate-load.js http://$ALB_DNS

# Custom load test
node scripts/generate-load.js http://$ALB_DNS --concurrency 20 --qps 100 --duration 300

# Test only health endpoint
node scripts/generate-load.js http://$ALB_DNS --endpoint health

# Test only order endpoint
node scripts/generate-load.js http://$ALB_DNS --endpoint order
```

Monitor autoscaling:
- ECS Service in AWS Console will show task count increasing
- CloudWatch Metrics: `CloudOps/OrderAPI` namespace
- Application logs: CloudWatch Logs `/ecs/cloudops-dev`

## Environment Variables

Set in ECS task definition (see `modules/compute/main.tf` lines 172-186):

- `PORT` - HTTP server port (default: 3000)
- `NODE_ENV` - Environment name (dev/staging/prod)
- `AWS_REGION` - AWS region for CloudWatch metrics

## CloudWatch Metrics

Published to `CloudOps/OrderAPI` namespace:

**Metric:** `OrdersCreated`
- **Unit:** Count
- **Value:** 1 (per order)
- **Dimensions:**
  - Environment: dev/staging/prod
  - Region: us-east-1

View in CloudWatch Console → Metrics → CloudOps/OrderAPI

## IAM Permissions Required

The ECS task role needs:
- `cloudwatch:PutMetricData` - To publish custom metrics

Configured in `modules/compute/main.tf` lines 133-146.

## Troubleshooting

### Container won't start
1. Check CloudWatch Logs: `/ecs/cloudops-dev`
2. Verify ECR image exists: `aws ecr describe-images --repository-name cloudops-dev-app`
3. Check ECS task execution role has ECR pull permissions

### Health checks failing
1. Ensure container port (3000) matches `container_port` in terraform.tfvars
2. Verify security group allows ALB → ECS traffic
3. Check container logs for startup errors

### No CloudWatch metrics
1. Verify ECS task role has `cloudwatch:PutMetricData` permission
2. Check application logs for metric publishing errors
3. Metrics may take 1-2 minutes to appear in console

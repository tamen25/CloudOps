const express = require('express');
const { CloudWatchClient, PutMetricDataCommand } = require('@aws-sdk/client-cloudwatch');

// Environment variables passed from ECS task definition
// See modules/compute/main.tf lines 172-186 for configuration
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'dev';
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';

const app = express();
app.use(express.json());

// CloudWatch client for publishing custom metrics
const cloudwatch = new CloudWatchClient({ region: AWS_REGION });

// In-memory order counter for demonstration
let orderCount = 0;

// Health check endpoint
// Used by ALB target group health checks (see terraform.tfvars health_check_path)
// Expected response: 200 OK with JSON body
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    region: AWS_REGION,
    environment: NODE_ENV,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    orderCount
  });
});

// Order creation endpoint
// Simulates order processing and publishes metrics to CloudWatch
app.post('/order', async (req, res) => {
  try {
    orderCount++;

    const order = {
      orderId: `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      environment: NODE_ENV,
      region: AWS_REGION,
      items: req.body.items || [],
      total: req.body.total || 0
    };

    // Log order to stdout (captured by CloudWatch Logs)
    console.log('Order created:', JSON.stringify(order));

    // Publish custom metric to CloudWatch
    // This demonstrates AWS SDK v3 integration for monitoring
    await publishOrderMetric();

    res.status(201).json({
      success: true,
      order,
      message: 'Order created successfully'
    });

  } catch (error) {
    console.error('Error processing order:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process order'
    });
  }
});

// GET /orders endpoint - returns order statistics
app.get('/orders', (req, res) => {
  res.status(200).json({
    totalOrders: orderCount,
    environment: NODE_ENV,
    region: AWS_REGION,
    timestamp: new Date().toISOString()
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    service: 'order-api',
    version: '1.0.0',
    environment: NODE_ENV,
    region: AWS_REGION,
    endpoints: {
      health: 'GET /health',
      createOrder: 'POST /order',
      getOrders: 'GET /orders'
    }
  });
});

// Publish custom CloudWatch metric for order count
// Requires IAM permissions: cloudwatch:PutMetricData (see modules/compute/main.tf lines 133-146)
async function publishOrderMetric() {
  try {
    const params = {
      Namespace: 'CloudOps/OrderAPI',
      MetricData: [
        {
          MetricName: 'OrdersCreated',
          Value: 1,
          Unit: 'Count',
          Timestamp: new Date(),
          Dimensions: [
            {
              Name: 'Environment',
              Value: NODE_ENV
            },
            {
              Name: 'Region',
              Value: AWS_REGION
            }
          ]
        }
      ]
    };

    const command = new PutMetricDataCommand(params);
    await cloudwatch.send(command);
    console.log('CloudWatch metric published: OrdersCreated');
  } catch (error) {
    // Don't fail the request if metric publishing fails
    console.error('Failed to publish CloudWatch metric:', error.message);
  }
}

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Order API listening on port ${PORT}`);
  console.log(`Environment: ${NODE_ENV}`);
  console.log(`Region: ${AWS_REGION}`);
  console.log(`Health check available at: http://localhost:${PORT}/health`);
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});

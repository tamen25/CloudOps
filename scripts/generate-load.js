#!/usr/bin/env node

/**
 * Load Generation Script for Order API
 *
 * Simulates concurrent traffic to test autoscaling and performance
 *
 * Usage:
 *   node scripts/generate-load.js <ALB_DNS_NAME> [options]
 *
 * Examples:
 *   node scripts/generate-load.js http://cloudops-dev-alb-123456789.us-east-1.elb.amazonaws.com
 *   node scripts/generate-load.js http://cloudops-dev-alb-123456789.us-east-1.elb.amazonaws.com --qps 50 --duration 300
 *   node scripts/generate-load.js http://cloudops-dev-alb-123456789.us-east-1.elb.amazonaws.com --concurrency 20 --qps 100 --duration 600
 *
 * Options:
 *   --concurrency <num>  Number of concurrent workers (default: 10)
 *   --qps <num>          Queries per second across all workers (default: 20)
 *   --duration <sec>     Test duration in seconds (default: 60)
 *   --endpoint <path>    Endpoint to test: health, order, mixed (default: mixed)
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

// Parse command line arguments
const args = process.argv.slice(2);
if (args.length === 0 || args[0].startsWith('--')) {
  console.error('Error: ALB DNS name is required');
  console.error('Usage: node scripts/generate-load.js <ALB_DNS_NAME> [options]');
  process.exit(1);
}

const targetUrl = args[0];
const config = {
  concurrency: parseInt(getArg('--concurrency', '10')),
  qps: parseInt(getArg('--qps', '20')),
  duration: parseInt(getArg('--duration', '60')),
  endpoint: getArg('--endpoint', 'mixed')
};

function getArg(flag, defaultValue) {
  const index = args.indexOf(flag);
  return index !== -1 && args[index + 1] ? args[index + 1] : defaultValue;
}

// Validate URL
let baseUrl;
try {
  baseUrl = new URL(targetUrl);
} catch (error) {
  console.error('Error: Invalid URL:', targetUrl);
  process.exit(1);
}

// Statistics
const stats = {
  requests: 0,
  success: 0,
  errors: 0,
  healthChecks: 0,
  orders: 0,
  totalLatency: 0,
  minLatency: Infinity,
  maxLatency: 0,
  statusCodes: {}
};

console.log('==========================================');
console.log('  CloudOps Load Generator');
console.log('==========================================');
console.log(`Target:       ${targetUrl}`);
console.log(`Concurrency:  ${config.concurrency} workers`);
console.log(`QPS:          ${config.qps} requests/sec`);
console.log(`Duration:     ${config.duration} seconds`);
console.log(`Endpoint:     ${config.endpoint}`);
console.log('==========================================\n');

// Calculate delay between requests per worker
const delayMs = Math.floor((1000 / config.qps) * config.concurrency);

// Worker function
async function worker(workerId) {
  const startTime = Date.now();
  const endTime = startTime + (config.duration * 1000);

  while (Date.now() < endTime) {
    const requestStart = Date.now();

    try {
      const endpoint = selectEndpoint(config.endpoint);
      const method = endpoint === '/order' ? 'POST' : 'GET';
      const body = endpoint === '/order' ? JSON.stringify({
        items: [{ id: 'item-1', quantity: Math.floor(Math.random() * 5) + 1 }],
        total: Math.floor(Math.random() * 1000) + 100
      }) : null;

      const statusCode = await makeRequest(endpoint, method, body);

      const latency = Date.now() - requestStart;

      stats.requests++;
      stats.totalLatency += latency;
      stats.minLatency = Math.min(stats.minLatency, latency);
      stats.maxLatency = Math.max(stats.maxLatency, latency);
      stats.statusCodes[statusCode] = (stats.statusCodes[statusCode] || 0) + 1;

      if (statusCode >= 200 && statusCode < 300) {
        stats.success++;
        if (endpoint === '/health') stats.healthChecks++;
        if (endpoint === '/order') stats.orders++;
      } else {
        stats.errors++;
      }

    } catch (error) {
      stats.requests++;
      stats.errors++;
      stats.statusCodes['error'] = (stats.statusCodes['error'] || 0) + 1;
    }

    // Wait before next request
    await sleep(delayMs);
  }
}

// Select endpoint based on strategy
function selectEndpoint(strategy) {
  switch (strategy) {
    case 'health':
      return '/health';
    case 'order':
      return '/order';
    case 'mixed':
    default:
      // 70% orders, 30% health checks
      return Math.random() < 0.7 ? '/order' : '/health';
  }
}

// Make HTTP request
function makeRequest(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const client = url.protocol === 'https:' ? https : http;

    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'CloudOps-LoadGenerator/1.0'
      }
    };

    if (body) {
      options.headers['Content-Length'] = Buffer.byteLength(body);
    }

    const req = client.request(url, options, (res) => {
      // Consume response data
      res.on('data', () => {});
      res.on('end', () => {
        resolve(res.statusCode);
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (body) {
      req.write(body);
    }

    req.end();
  });
}

// Sleep utility
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Print statistics
function printStats() {
  const avgLatency = stats.requests > 0 ? (stats.totalLatency / stats.requests).toFixed(2) : 0;
  const successRate = stats.requests > 0 ? ((stats.success / stats.requests) * 100).toFixed(2) : 0;
  const actualQps = (stats.requests / config.duration).toFixed(2);

  console.log('\n==========================================');
  console.log('  Load Test Results');
  console.log('==========================================');
  console.log(`Total Requests:    ${stats.requests}`);
  console.log(`Successful:        ${stats.success} (${successRate}%)`);
  console.log(`Errors:            ${stats.errors}`);
  console.log(`Health Checks:     ${stats.healthChecks}`);
  console.log(`Orders Created:    ${stats.orders}`);
  console.log('------------------------------------------');
  console.log(`Actual QPS:        ${actualQps}`);
  console.log(`Avg Latency:       ${avgLatency} ms`);
  console.log(`Min Latency:       ${stats.minLatency === Infinity ? 0 : stats.minLatency} ms`);
  console.log(`Max Latency:       ${stats.maxLatency} ms`);
  console.log('------------------------------------------');
  console.log('Status Codes:');
  Object.entries(stats.statusCodes)
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([code, count]) => {
      console.log(`  ${code}: ${count}`);
    });
  console.log('==========================================\n');
}

// Print progress every 10 seconds
let progressInterval;
function startProgressReporting() {
  progressInterval = setInterval(() => {
    const elapsed = Math.min(config.duration, Math.floor((Date.now() - testStartTime) / 1000));
    const currentQps = (stats.requests / elapsed).toFixed(2);
    const successRate = stats.requests > 0 ? ((stats.success / stats.requests) * 100).toFixed(1) : 0;

    process.stdout.write(`\r[${elapsed}/${config.duration}s] Requests: ${stats.requests} | QPS: ${currentQps} | Success: ${successRate}%`);
  }, 2000);
}

// Main execution
let testStartTime;
async function main() {
  console.log('Starting load test...\n');

  testStartTime = Date.now();
  startProgressReporting();

  // Spawn workers
  const workers = [];
  for (let i = 0; i < config.concurrency; i++) {
    workers.push(worker(i));
  }

  // Wait for all workers to complete
  await Promise.all(workers);

  clearInterval(progressInterval);
  printStats();

  console.log('Next steps:');
  console.log('1. Check CloudWatch Metrics: CloudOps/OrderAPI namespace');
  console.log('2. Monitor ECS Service autoscaling events');
  console.log('3. View application logs in CloudWatch Logs: /ecs/cloudops-dev');
  console.log('4. Check ALB target health and request count\n');
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\nTest interrupted by user');
  clearInterval(progressInterval);
  printStats();
  process.exit(0);
});

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});

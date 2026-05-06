const axios = require('axios');
require('dotenv').config();

const API_BASE = process.env.NETCORE_API_BASE_URL;
const APP_ID = process.env.NETCORE_APP_ID;
const APP_SECRET = process.env.NETCORE_APP_SECRET;

const headers = {
  'x-app-id': APP_ID,
  'x-app-secret': APP_SECRET,
  'Content-Type': 'application/json',
};

// Test various endpoints
const endpointsToTest = [
  { method: 'POST', path: '/users', data: { limit: 10 } },
  { method: 'POST', path: '/v1/users', data: { limit: 10 } },
  { method: 'GET', path: '/users' },
  { method: 'GET', path: '/v1/users' },
  { method: 'POST', path: '/customer', data: { limit: 10 } },
  { method: 'POST', path: '/v1/customer', data: { limit: 10 } },
  { method: 'POST', path: '/customers/list', data: { limit: 10 } },
  { method: 'GET', path: '/v1/userData/123' },
];

async function testEndpoint(method, path, data = null) {
  try {
    const config = {
      method,
      url: `${API_BASE}${path}`,
      headers,
      timeout: 10000,
    };

    if (data) {
      config.data = data;
    }

    const response = await axios(config);
    return { status: response.status, statusText: response.statusText, hasData: !!response.data };
  } catch (error) {
    const status = error.response?.status || 'FAIL';
    return { status, statusText: error.response?.statusText || error.message };
  }
}

async function runTests() {
  console.log('\n🧪 TESTING API ENDPOINTS\n');
  console.log(`API Base: ${API_BASE}`);
  console.log('='.repeat(80) + '\n');

  for (const { method, path, data } of endpointsToTest) {
    const result = await testEndpoint(method, path, data);
    const dataStr = data ? ' [with payload]' : '';
    console.log(`${method.padEnd(6)} ${path.padEnd(30)} → ${String(result.status).padEnd(6)} ${result.statusText}`);
  }

  console.log('\n' + '='.repeat(80) + '\n');
}

runTests();

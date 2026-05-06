const axios = require('axios');
require('dotenv').config();

const API_BASE = process.env.NETCORE_API_BASE_URL;
const APP_ID = process.env.NETCORE_APP_ID;
const APP_SECRET = process.env.NETCORE_APP_SECRET;

console.log('\n' + '='.repeat(80));
console.log('🔄 FETCHING USERS FROM NETCORE API');
console.log('='.repeat(80));
console.log(`API Base: ${API_BASE}`);
console.log(`App ID: ${APP_ID.substring(0, 10)}...`);
console.log('='.repeat(80) + '\n');

// Test different endpoint combinations
const endpointVariations = [
  '/users',
  '/v1/users',
  '/api/users',
  '/customer',
  '/v1/customer',
  '/customers',
  '/v1/customers',
];

async function testEndpoint(endpoint) {
  try {
    console.log(`\n📥 Testing endpoint: ${endpoint}`);

    const config = {
      method: 'POST',
      url: `${API_BASE}${endpoint}`,
      headers: {
        'x-app-id': APP_ID,
        'x-app-secret': APP_SECRET,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
      data: {
        limit: 10,
        offset: 0,
      },
    };

    console.log(`   URL: ${config.url}`);
    console.log(`   Headers: x-app-id, x-app-secret`);
    console.log(`   Method: POST`);
    console.log(`   Payload: { limit: 10, offset: 0 }`);

    const response = await axios(config);

    console.log(`\n✅ SUCCESS on ${endpoint}`);
    console.log(`   Status: ${response.status} ${response.statusText}`);
    console.log(`   Response type: ${typeof response.data}`);

    if (response.data) {
      if (Array.isArray(response.data)) {
        console.log(`   Data: Array with ${response.data.length} items`);
        if (response.data[0]) {
          console.log(`   First item keys: ${Object.keys(response.data[0]).join(', ')}`);
        }
      } else if (response.data.data) {
        console.log(`   Data.data: ${Array.isArray(response.data.data) ? `Array with ${response.data.data.length} items` : 'Object'}`);
        if (Array.isArray(response.data.data) && response.data.data[0]) {
          console.log(`   First user keys: ${Object.keys(response.data.data[0]).join(', ')}`);
        }
      } else if (response.data.users) {
        console.log(`   Data.users: Array with ${response.data.users.length} items`);
        if (response.data.users[0]) {
          console.log(`   First user keys: ${Object.keys(response.data.users[0]).join(', ')}`);
        }
      }
    }

    console.log(`\n   🎉 Found working endpoint: ${endpoint}`);
    return { endpoint, success: true, data: response.data };
  } catch (error) {
    const status = error.response?.status || 'FAIL';
    const message = error.response?.statusText || error.message;
    console.log(`   ❌ ${status} - ${message}`);
    return { endpoint, success: false, status, message };
  }
}

async function main() {
  console.log('🔍 Testing all endpoint variations...\n');

  const results = [];
  for (const endpoint of endpointVariations) {
    const result = await testEndpoint(endpoint);
    results.push(result);
    if (result.success) {
      console.log('\n' + '='.repeat(80));
      console.log('✅ WORKING ENDPOINT FOUND!');
      console.log('='.repeat(80));
      console.log(`\nUpdate sync script with:`);
      console.log(`  const ENDPOINT = '${result.endpoint}';`);
      console.log('\nSample response structure:');
      console.log(JSON.stringify(result.data, null, 2).substring(0, 500) + '...');
      return;
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('⚠️  NO WORKING ENDPOINTS FOUND');
  console.log('='.repeat(80));
  console.log('\nTested endpoints:');
  results.forEach(r => {
    console.log(`  ${r.success ? '✅' : '❌'} ${r.endpoint.padEnd(20)} (${r.status || 'OK'})`);
  });

  console.log('\n💡 Suggestions:');
  console.log('  1. Verify API credentials in .env file');
  console.log('  2. Check if API base URL is correct');
  console.log('  3. Ensure your IP is whitelisted on Netcore API');
  console.log('  4. Check Netcore API status/documentation');
}

main();

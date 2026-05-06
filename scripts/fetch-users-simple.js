const axios = require('axios');
require('dotenv').config();

const API_BASE = process.env.NETCORE_API_BASE_URL;
const APP_ID = process.env.NETCORE_APP_ID;
const APP_SECRET = process.env.NETCORE_APP_SECRET;

console.log('\n' + '='.repeat(80));
console.log('🔄 TESTING USER FETCH');
console.log('='.repeat(80) + '\n');

async function testLogin() {
  console.log('🔐 Step 1: Testing Login...\n');
  try {
    const response = await axios.post(`${API_BASE}/login`, {
      appId: APP_ID,
      appSecret: APP_SECRET,
    });

    console.log(`✅ Login successful!`);
    console.log(`   Status: ${response.status}`);
    console.log(`   Token: ${response.data.authToken.substring(0, 30)}...`);
    console.log(`   Response keys: ${Object.keys(response.data).join(', ')}\n`);

    return response.data.authToken;
  } catch (error) {
    console.error(`❌ Login failed: ${error.response?.status} - ${error.response?.data?.message || error.message}\n`);
    throw error;
  }
}

async function fetchUsersWithToken(token) {
  console.log('👥 Step 2: Fetching users with token...\n');

  // Try different header combinations
  const headerVariations = [
    { name: 'Authorization header only', headers: { 'Authorization': token } },
    { name: 'Authorization with Bearer', headers: { 'Authorization': `Bearer ${token}` } },
    { name: 'x-auth-token', headers: { 'x-auth-token': token } },
    { name: 'authToken header', headers: { 'authToken': token } },
  ];

  for (const { name, headers } of headerVariations) {
    try {
      console.log(`   Trying: ${name}`);

      const config = {
        method: 'POST',
        url: `${API_BASE}/users`,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        data: {
          limit: 5,
          offset: 0,
        },
        timeout: 10000,
      };

      const response = await axios(config);

      console.log(`   ✅ SUCCESS with ${name}!`);
      console.log(`   Status: ${response.status}`);
      console.log(`   Response type: ${typeof response.data}`);

      if (Array.isArray(response.data)) {
        console.log(`   Users count: ${response.data.length}`);
        if (response.data[0]) {
          console.log(`   First user keys: ${Object.keys(response.data[0]).join(', ')}\n`);
        }
      } else {
        console.log(`   Response data keys: ${Object.keys(response.data).join(', ')}\n`);
      }

      return response.data;
    } catch (error) {
      const status = error.response?.status || 'ERROR';
      const message = error.response?.data?.message || error.message;
      console.log(`   ❌ Failed: ${status} - ${message}`);
    }
  }

  console.log(`\n   No header variation worked!\n`);
  return null;
}

async function main() {
  try {
    const token = await testLogin();
    const users = await fetchUsersWithToken(token);

    if (!users) {
      console.log('⚠️  Could not fetch users with any header variation');
      console.log('    Try checking Netcore API documentation or contact support');
    }
  } catch (error) {
    console.error('Fatal error:', error.message);
  }

  console.log('='.repeat(80) + '\n');
}

main();

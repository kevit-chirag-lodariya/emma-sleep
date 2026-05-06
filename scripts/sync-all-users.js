const { MongoClient } = require('mongodb');
const axios = require('axios');
require('dotenv').config();

const API_BASE = process.env.NETCORE_API_BASE_URL;
const APP_ID = process.env.NETCORE_APP_ID;
const APP_SECRET = process.env.NETCORE_APP_SECRET;
const MONGODB_URI = process.env.MONGODB_URI;

const SYNC_LIMIT = 500;
const BATCH_SIZE = 100;

let authToken = null;
let syncStats = {
  usersLoaded: 0,
  usersInserted: 0,
  messagesInserted: 0,
  usersRemoved: 0,
  errors: [],
};

// Step 1: Authenticate and get token
async function getAuthToken() {
  console.log('\n🔐 STEP 0: Authenticating with Netcore API...\n');

  try {
    const response = await axios.post(`${API_BASE}/login`, {
      appId: APP_ID,
      appSecret: APP_SECRET,
    });

    authToken = response.data.authToken;
    console.log(`✅ Authentication successful!`);
    console.log(`   Token: ${authToken.substring(0, 20)}...`);
    console.log(`   Expires: ${response.data.expireAt}\n`);

    return authToken;
  } catch (error) {
    console.error(`\n❌ Authentication failed: ${error.response?.data?.message || error.message}`);
    syncStats.errors.push(`Auth error: ${error.message}`);
    throw error;
  }
}

// API caller with token
async function callAPI(endpoint, method = 'POST', data = null) {
  try {
    const config = {
      method,
      url: `${API_BASE}${endpoint}`,
      headers: {
        'Authorization': authToken,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    };

    if (data) {
      config.data = data;
    }

    const response = await axios(config);
    return response.data;
  } catch (error) {
    throw error;
  }
}

// Fetch users - all channels from last 5 days
async function fetchUsers(limit = SYNC_LIMIT) {
  console.log('\n📥 STEP 1: Fetching users from last 5 days...\n');

  try {
    // Get date range for last 5 days
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 5);

    const payload = {
      channelIds: [1010, 1014, 1016, 1017, 1021], // All channels
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    };

    console.log(`   Date Range: ${startDate.toISOString().substring(0, 10)} to ${endDate.toISOString().substring(0, 10)}`);
    console.log(`   Channels: All (webchat, whatsapp, telegram, facebook, instagram)`);
    console.log(`   Fetching users...\n`);

    const response = await callAPI('/users', 'POST', payload);

    let users = [];
    if (Array.isArray(response)) {
      users = response;
    } else if (response.data && Array.isArray(response.data)) {
      users = response.data;
    } else if (response.users && Array.isArray(response.users)) {
      users = response.users;
    }

    console.log(`✅ Fetched ${users.length} users from API\n`);
    syncStats.usersLoaded = users.length;

    if (users.length > 0) {
      console.log(`   Sample user keys: ${Object.keys(users[0]).join(', ')}\n`);
    }

    return users;
  } catch (error) {
    console.error(`❌ Failed to fetch users: ${error.response?.data?.message || error.message}`);
    syncStats.errors.push(`Fetch users: ${error.message}`);
    throw error;
  }
}

// Fetch individual user data
async function fetchUserData(userId) {
  try {
    const response = await callAPI(`/userData/${userId}`, 'GET');

    const user = response.data || response;
    return {
      userId: user.id || user.userId || userId,
      botUserId: user.botUserId || user.phoneNumber || user.phone || '-',
      name: user.name || user.customerName || 'Unknown',
      email: user.email || null,
      phoneNumber: user.phoneNumber || user.phone || null,
      customFields: user.customFields || user.custom_fields || {},
      tags: user.tags || user.tag || [],
      channelName: user.channelName || user.channel || 'whatsapp',
      lastInteractedDate: user.lastInteractedDate || new Date(),
      createdAt: user.createdAt || new Date(),
    };
  } catch (error) {
    return null;
  }
}

// Fetch transcripts/messages
async function fetchMessages(userId, limit = 100) {
  try {
    const payload = {
      filters: {
        userId: userId,
      },
      limit: limit,
      offset: 0,
    };

    const response = await callAPI('/transcripts', 'POST', payload);

    let messages = [];
    if (response.data && Array.isArray(response.data)) {
      messages = response.data;
    } else if (response.transcripts && Array.isArray(response.transcripts)) {
      messages = response.transcripts;
    } else if (Array.isArray(response)) {
      messages = response;
    }

    return messages.map((msg) => ({
      _id: msg.id || msg._id,
      userId,
      from: msg.from || msg.sender || 'user',
      textMessage: msg.text || msg.textMessage || msg.message || '',
      type: msg.type || 'text',
      sentAt: msg.sentAt || msg.timestamp || msg.createdAt || new Date(),
      metadata: msg.metadata || {},
    }));
  } catch (error) {
    return [];
  }
}

// Clear existing data
async function clearExistingData(db) {
  console.log('\n🗑️  STEP 2: Clearing existing data...\n');

  try {
    const customersCollection = db.collection('customers');
    const messagesCollection = db.collection('messages');

    const customersResult = await customersCollection.deleteMany({});
    const messagesResult = await messagesCollection.deleteMany({});

    syncStats.usersRemoved = customersResult.deletedCount;
    console.log(`✅ Removed ${customersResult.deletedCount} existing customers`);
    console.log(`✅ Removed ${messagesResult.deletedCount} existing messages\n`);
  } catch (error) {
    console.error(`❌ Error clearing data: ${error.message}`);
    syncStats.errors.push(`Clear error: ${error.message}`);
  }
}

// Sync users
async function syncUsers(db, users) {
  console.log('\n👥 STEP 3: Processing user details and syncing...\n');

  const customersCollection = db.collection('customers');
  const usersToInsert = [];

  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    const userData = await fetchUserData(user.id || user.userId || user._id);

    if (userData) {
      usersToInsert.push(userData);
      syncStats.usersInserted++;
    }

    // Batch insert
    if ((i + 1) % BATCH_SIZE === 0 || i === users.length - 1) {
      if (usersToInsert.length > 0) {
        try {
          await customersCollection.insertMany(usersToInsert);
          console.log(`✅ ${syncStats.usersInserted} users inserted (${i + 1}/${users.length} processed)`);
          usersToInsert.length = 0;
        } catch (error) {
          console.error(`❌ Insert error: ${error.message}`);
          syncStats.errors.push(`Insert error: ${error.message}`);
        }
      }
    }
  }

  console.log(`\n✨ User sync complete: ${syncStats.usersInserted} users inserted\n`);
}

// Sync messages
async function syncMessages(db, users) {
  console.log('\n💬 STEP 4: Fetching and syncing messages...\n');

  const messagesCollection = db.collection('messages');

  for (let i = 0; i < users.length; i++) {
    const userId = users[i].id || users[i].userId || users[i]._id;
    if (!userId) continue;

    const messages = await fetchMessages(userId);

    if (messages.length > 0) {
      try {
        const result = await messagesCollection.insertMany(messages);
        syncStats.messagesInserted += result.insertedCount;
      } catch (error) {
        syncStats.errors.push(`Message insert error: ${error.message}`);
      }
    }

    if ((i + 1) % BATCH_SIZE === 0) {
      console.log(`✅ ${syncStats.messagesInserted} messages synced (${i + 1}/${users.length} users processed)`);
    }
  }

  console.log(`\n✨ Message sync complete: ${syncStats.messagesInserted} messages inserted\n`);
}

// Generate report
function generateReport() {
  console.log('\n' + '='.repeat(80));
  console.log('📊 SYNC REPORT');
  console.log('='.repeat(80) + '\n');

  console.log('📈 Summary:');
  console.log(`   ✅ Users from API: ${syncStats.usersLoaded}`);
  console.log(`   ✅ Users inserted: ${syncStats.usersInserted}`);
  console.log(`   ✅ Messages inserted: ${syncStats.messagesInserted}`);
  console.log(`   ✅ Existing users removed: ${syncStats.usersRemoved}`);

  if (syncStats.errors.length > 0) {
    console.log(`\n⚠️  Errors: ${syncStats.errors.length}`);
    syncStats.errors.slice(0, 5).forEach((err) => {
      console.log(`   • ${err}`);
    });
    if (syncStats.errors.length > 5) {
      console.log(`   ... and ${syncStats.errors.length - 5} more`);
    }
  } else {
    console.log('\n✅ No errors!');
  }

  console.log('\n' + '='.repeat(80) + '\n');
}

// Main sync function
async function syncFromAPI() {
  const client = new MongoClient(MONGODB_URI);

  try {
    console.log('\n' + '='.repeat(80));
    console.log('🔄 USER SYNC FROM NETCORE API');
    console.log('='.repeat(80));
    console.log(`API: ${API_BASE}`);
    console.log(`Target: ${SYNC_LIMIT} users`);
    console.log('='.repeat(80));

    // Step 0: Authenticate
    await getAuthToken();

    // Step 1: Fetch users
    const users = await fetchUsers(SYNC_LIMIT);
    if (users.length === 0) {
      console.log('❌ No users fetched');
      return;
    }

    // Connect DB
    await client.connect();
    console.log('✅ Connected to MongoDB\n');

    const db = client.db('emma-sleep');

    // Step 2: Clear data
    await clearExistingData(db);

    // Step 3: Sync users
    await syncUsers(db, users);

    // Step 4: Sync messages
    await syncMessages(db, users);

    // Report
    generateReport();

    await client.close();
  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    generateReport();
    process.exit(1);
  }
}

syncFromAPI();

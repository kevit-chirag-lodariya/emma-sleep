const { MongoClient } = require('mongodb');
const axios = require('axios');
require('dotenv').config();

const NETCORE_API_BASE = process.env.NETCORE_API_BASE_URL;
const NETCORE_APP_ID = process.env.NETCORE_APP_ID;
const NETCORE_APP_SECRET = process.env.NETCORE_APP_SECRET;
const MONGODB_URI = process.env.MONGODB_URI;

const SYNC_LIMIT = 500;
const BATCH_SIZE = 100;

let syncStats = {
  usersLoaded: 0,
  userDetailsLoaded: 0,
  messagesLoaded: 0,
  usersRemoved: 0,
  usersInserted: 0,
  messagesInserted: 0,
  errors: [],
};

// API caller with retry logic
async function callNetcoreAPI(endpoint, method = 'GET', data = null, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const config = {
        method,
        url: `${NETCORE_API_BASE}${endpoint}`,
        headers: {
          'x-app-id': NETCORE_APP_ID,
          'x-app-secret': NETCORE_APP_SECRET,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      };

      if (data && (method === 'POST' || method === 'PUT')) {
        config.data = data;
      }

      const response = await axios(config);
      return response.data;
    } catch (error) {
      if (attempt === retries) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
}

// Fetch users - try multiple endpoint possibilities
async function fetchAllUsers() {
  console.log('\n📥 STEP 1: Fetching user list from Netcore API...\n');

  const endpoints = [
    '/users',
    '/user/list',
    '/customer/list',
    '/customers',
    '/api/users',
    '/api/customers',
  ];

  for (const endpoint of endpoints) {
    try {
      console.log(`   Trying endpoint: ${endpoint}`);
      const response = await callNetcoreAPI(endpoint);

      let users = [];
      if (Array.isArray(response)) {
        users = response;
      } else if (response.data && Array.isArray(response.data)) {
        users = response.data;
      } else if (response.users && Array.isArray(response.users)) {
        users = response.users;
      } else if (response.customers && Array.isArray(response.customers)) {
        users = response.customers;
      }

      if (users.length > 0) {
        console.log(`✅ Success! Found ${users.length} users at endpoint: ${endpoint}\n`);
        syncStats.usersLoaded = users.length;
        return users.slice(0, SYNC_LIMIT);
      }
    } catch (error) {
      console.log(`   ❌ ${endpoint}: ${error.response?.status || error.message}`);
    }
  }

  console.error('\n❌ Could not fetch users from any endpoint');
  return [];
}

// Fetch detailed user data
async function fetchUserDetails(user, index) {
  try {
    const userId = user.id || user.userId || user._id;
    if (!userId) return null;

    // Try to get enhanced data via usergetdata endpoint
    try {
      const response = await callNetcoreAPI(`/usergetdata?id=${userId}`);
      const userData = response.data || response;

      return {
        userId: userData.id || userData.userId || userId,
        botUserId: userData.botUserId || user.botUserId || user.phoneNumber || user.phone || '-',
        name: userData.name || userData.customerName || user.name || 'Unknown',
        email: userData.email || user.email || null,
        phoneNumber: userData.phoneNumber || userData.phone || user.phoneNumber || user.phone || null,
        customFields: userData.customFields || userData.custom_fields || user.customFields || {},
        tags: userData.tags || userData.tag || user.tags || [],
        channelName: userData.channelName || userData.channel || user.channelName || user.channel || 'whatsapp',
        lastInteractedDate: userData.lastInteractedDate || user.lastInteractedDate || new Date(),
        createdAt: userData.createdAt || user.createdAt || new Date(),
      };
    } catch (error) {
      // Fallback to basic user data if detailed endpoint fails
      return {
        userId: user.id || user.userId,
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
    }
  } catch (error) {
    syncStats.errors.push(`Failed to get details for user: ${error.message}`);
    return null;
  }
}

// Fetch messages for a user
async function fetchUserMessages(userId, index) {
  try {
    const endpoints = [
      `/users/${userId}/messages`,
      `/user/${userId}/messages`,
      `/customer/${userId}/messages`,
      `/messages?userId=${userId}`,
      `/api/messages?userId=${userId}`,
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await callNetcoreAPI(endpoint);

        let messages = [];
        if (Array.isArray(response)) {
          messages = response;
        } else if (response.data && Array.isArray(response.data)) {
          messages = response.data;
        } else if (response.messages && Array.isArray(response.messages)) {
          messages = response.messages;
        }

        if (messages.length > 0) {
          syncStats.messagesLoaded += messages.length;
          return messages.map((msg) => ({
            _id: msg.id || msg._id,
            userId,
            from: msg.from || 'user',
            textMessage: msg.textMessage || msg.text || msg.message || '',
            type: msg.type || 'text',
            sentAt: msg.sentAt || msg.timestamp || new Date(),
            metadata: msg.metadata || {},
          }));
        }
      } catch (error) {
        continue;
      }
    }

    return [];
  } catch (error) {
    syncStats.errors.push(`Failed to get messages for user ${userId}: ${error.message}`);
    return [];
  }
}

// Clear existing data
async function clearExistingData(db) {
  console.log('\n🗑️  STEP 2: Clearing existing data...\n');

  try {
    const customersCollection = db.collection('customers');
    const messagesCollection = db.collection('messages');

    const customersDeleted = await customersCollection.deleteMany({});
    const messagesDeleted = await messagesCollection.deleteMany({});

    syncStats.usersRemoved = customersDeleted.deletedCount;
    console.log(`✅ Removed ${customersDeleted.deletedCount} existing customers`);
    console.log(`✅ Removed ${messagesDeleted.deletedCount} existing messages\n`);
  } catch (error) {
    console.error('❌ Failed to clear data:', error.message);
    syncStats.errors.push(`Failed to clear data: ${error.message}`);
  }
}

// Sync users
async function syncUsers(db, users) {
  console.log('\n👥 STEP 3: Loading user details from API...\n');

  const customersCollection = db.collection('customers');
  const usersToInsert = [];

  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    const userDetails = await fetchUserDetails(user, i);

    if (userDetails) {
      usersToInsert.push(userDetails);
      syncStats.userDetailsLoaded++;
    }

    // Batch insert every BATCH_SIZE users
    if ((i + 1) % BATCH_SIZE === 0 || i === users.length - 1) {
      if (usersToInsert.length > 0) {
        try {
          const result = await customersCollection.insertMany(usersToInsert);
          syncStats.usersInserted += result.insertedCount;
          console.log(`✅ ${syncStats.usersInserted} users inserted so far...`);
          usersToInsert.length = 0;
        } catch (error) {
          console.error(`❌ Insert error:`, error.message);
          syncStats.errors.push(`Insert failed: ${error.message}`);
        }
      }
    }
  }

  console.log(`\n✨ User sync complete: ${syncStats.usersInserted} users inserted\n`);
}

// Sync messages
async function syncMessages(db, users) {
  console.log('\n💬 STEP 4: Loading messages from API...\n');

  const messagesCollection = db.collection('messages');

  for (let i = 0; i < users.length; i++) {
    const userId = users[i].id || users[i].userId || users[i]._id;
    if (!userId) continue;

    const messages = await fetchUserMessages(userId, i);

    if (messages.length > 0) {
      try {
        const result = await messagesCollection.insertMany(messages);
        syncStats.messagesInserted += result.insertedCount;
      } catch (error) {
        syncStats.errors.push(`Failed to insert messages: ${error.message}`);
      }
    }

    if ((i + 1) % BATCH_SIZE === 0) {
      console.log(`✅ ${syncStats.messagesInserted} messages inserted so far...`);
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
  console.log(`   ✓ Users from API: ${syncStats.usersLoaded}`);
  console.log(`   ✓ Users synced: ${syncStats.usersInserted}`);
  console.log(`   ✓ Messages synced: ${syncStats.messagesInserted}`);
  console.log(`   ✓ Users removed: ${syncStats.usersRemoved}`);

  if (syncStats.errors.length > 0) {
    console.log('\n⚠️  Errors:');
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

// Main function
async function syncUsersFromNetcore() {
  const client = new MongoClient(MONGODB_URI);

  try {
    console.log('\n' + '='.repeat(80));
    console.log('🔄 USER SYNC FROM NETCORE API');
    console.log('='.repeat(80));
    console.log(`Target: ${SYNC_LIMIT} users`);
    console.log('='.repeat(80));

    await client.connect();
    console.log('✅ Connected to MongoDB');

    const db = client.db('emma-sleep');

    // Fetch users
    const users = await fetchAllUsers();
    if (users.length === 0) {
      console.log('❌ No users found');
      return;
    }

    // Clear data
    await clearExistingData(db);

    // Sync
    await syncUsers(db, users);
    await syncMessages(db, users);

    // Report
    generateReport();

    await client.close();
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    generateReport();
    process.exit(1);
  }
}

syncUsersFromNetcore();

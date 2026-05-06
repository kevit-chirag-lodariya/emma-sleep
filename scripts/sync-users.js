const { MongoClient } = require('mongodb');
const axios = require('axios');
require('dotenv').config();

const NETCORE_API_BASE = process.env.NETCORE_API_BASE_URL;
const NETCORE_APP_ID = process.env.NETCORE_APP_ID;
const NETCORE_APP_SECRET = process.env.NETCORE_APP_SECRET;
const MONGODB_URI = process.env.MONGODB_URI;

const SYNC_LIMIT = 500; // Users to sync
const BATCH_SIZE = 100; // Progress update frequency

let syncStats = {
  usersLoaded: 0,
  userDetailsLoaded: 0,
  messagesLoaded: 0,
  usersRemoved: 0,
  usersInserted: 0,
  messagesInserted: 0,
  errors: [],
};

// Netcore API call helper
async function callNetcoreAPI(endpoint, method = 'GET', data = null) {
  try {
    const config = {
      method,
      url: `${NETCORE_API_BASE}${endpoint}`,
      headers: {
        'x-app-id': NETCORE_APP_ID,
        'x-app-secret': NETCORE_APP_SECRET,
        'Content-Type': 'application/json',
      },
    };

    if (data && (method === 'POST' || method === 'PUT')) {
      config.data = data;
    }

    const response = await axios(config);
    return response.data;
  } catch (error) {
    console.error(`API Error on ${endpoint}:`, error.message);
    throw error;
  }
}

// Fetch all users from API
async function fetchAllUsers() {
  console.log('\n📥 STEP 1: Fetching user list from Netcore API...\n');

  try {
    const response = await callNetcoreAPI('/users');
    const users = response.data || response.users || [];

    console.log(`✅ Loaded ${users.length} users from API`);
    syncStats.usersLoaded = users.length;

    // Return only first SYNC_LIMIT users
    return users.slice(0, SYNC_LIMIT);
  } catch (error) {
    console.error('❌ Failed to fetch users:', error.message);
    syncStats.errors.push(`Failed to fetch users: ${error.message}`);
    return [];
  }
}

// Fetch detailed user data including custom fields and tags
async function fetchUserDetails(userId, index) {
  try {
    const response = await callNetcoreAPI(`/users/${userId}`);
    const userData = response.data || response;

    // Show progress every BATCH_SIZE
    if ((index + 1) % BATCH_SIZE === 0) {
      console.log(`   ✓ ${index + 1} user details loaded...`);
    }

    return {
      userId: userData.id || userData.userId || userId,
      botUserId: userData.botUserId || userData.phoneNumber || userData.phone || '-',
      name: userData.name || userData.customerName || 'Unknown',
      email: userData.email || null,
      phoneNumber: userData.phoneNumber || userData.phone || null,
      customFields: userData.customFields || userData.custom_fields || {},
      tags: userData.tags || userData.tag || [],
      channelName: userData.channelName || userData.channel || 'whatsapp',
      lastInteractedDate: userData.lastInteractedDate || new Date(),
      createdAt: userData.createdAt || new Date(),
    };
  } catch (error) {
    syncStats.errors.push(`Failed to get details for user ${userId}: ${error.message}`);
    return null;
  }
}

// Fetch messages for a specific user
async function fetchUserMessages(userId, index) {
  try {
    const response = await callNetcoreAPI(`/users/${userId}/messages`);
    const messages = response.data || response.messages || [];

    // Show progress every BATCH_SIZE
    if ((index + 1) % BATCH_SIZE === 0) {
      console.log(`   ✓ ${index + 1} users' messages loaded...`);
    }

    return messages.map((msg) => ({
      _id: msg.id || msg._id || new Date().getTime().toString(),
      userId,
      from: msg.from || 'user',
      textMessage: msg.textMessage || msg.text || msg.message || '',
      type: msg.type || 'text',
      sentAt: msg.sentAt || msg.timestamp || new Date(),
      metadata: msg.metadata || {},
    }));
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
    console.log(`✅ Removed ${messagesDeleted.deletedCount} existing messages`);
  } catch (error) {
    console.error('❌ Failed to clear data:', error.message);
    syncStats.errors.push(`Failed to clear data: ${error.message}`);
  }
}

// Sync users and their details
async function syncUsers(db, userIds) {
  console.log('\n👥 STEP 3: Fetching detailed user data...\n');

  const customersCollection = db.collection('customers');
  const usersToInsert = [];

  for (let i = 0; i < userIds.length; i++) {
    const userId = userIds[i];
    const userDetails = await fetchUserDetails(userId, i);

    if (userDetails) {
      usersToInsert.push(userDetails);
      syncStats.userDetailsLoaded++;
    }

    // Batch insert every BATCH_SIZE users
    if ((i + 1) % BATCH_SIZE === 0 || i === userIds.length - 1) {
      if (usersToInsert.length > 0) {
        try {
          const result = await customersCollection.insertMany(usersToInsert);
          syncStats.usersInserted += result.insertedCount;
          console.log(`✅ Inserted ${result.insertedCount} users (Total: ${syncStats.usersInserted})`);
          usersToInsert.length = 0; // Clear array
        } catch (error) {
          console.error(`❌ Batch insert error:`, error.message);
          syncStats.errors.push(`Batch insert failed: ${error.message}`);
        }
      }
    }
  }

  console.log(`\n✨ User sync complete: ${syncStats.usersInserted} users inserted\n`);
}

// Sync messages for all users
async function syncMessages(db, userIds) {
  console.log('\n💬 STEP 4: Fetching and syncing user messages...\n');

  const messagesCollection = db.collection('messages');
  let totalMessagesInserted = 0;

  for (let i = 0; i < userIds.length; i++) {
    const userId = userIds[i];
    const messages = await fetchUserMessages(userId, i);

    if (messages.length > 0) {
      try {
        const result = await messagesCollection.insertMany(messages);
        syncStats.messagesInserted += result.insertedCount;
        totalMessagesInserted += result.insertedCount;
      } catch (error) {
        syncStats.errors.push(`Failed to insert messages for user ${userId}: ${error.message}`);
      }
    }

    // Show progress every BATCH_SIZE users
    if ((i + 1) % BATCH_SIZE === 0) {
      console.log(`   ✓ Processed ${i + 1} users' messages (Total messages: ${syncStats.messagesInserted})`);
    }
  }

  console.log(`\n✨ Message sync complete: ${syncStats.messagesInserted} messages inserted\n`);
}

// Generate sync report
function generateReport() {
  console.log('\n' + '='.repeat(80));
  console.log('📊 SYNC REPORT');
  console.log('='.repeat(80) + '\n');

  console.log('📈 Statistics:');
  console.log(`   Total users loaded from API: ${syncStats.usersLoaded}`);
  console.log(`   Users to sync: ${SYNC_LIMIT}`);
  console.log(`   User details loaded: ${syncStats.userDetailsLoaded}`);
  console.log(`   Existing users removed: ${syncStats.usersRemoved}`);
  console.log(`   New users inserted: ${syncStats.usersInserted}`);
  console.log(`   Messages inserted: ${syncStats.messagesInserted}`);

  if (syncStats.errors.length > 0) {
    console.log('\n⚠️  Errors encountered:');
    syncStats.errors.slice(0, 10).forEach((error) => {
      console.log(`   • ${error}`);
    });
    if (syncStats.errors.length > 10) {
      console.log(`   ... and ${syncStats.errors.length - 10} more errors`);
    }
  } else {
    console.log('\n✅ No errors encountered!');
  }

  console.log('\n' + '='.repeat(80));
  console.log('✨ Sync completed successfully!');
  console.log('='.repeat(80) + '\n');
}

// Main sync function
async function syncUsersFromNetcore() {
  const client = new MongoClient(MONGODB_URI);

  try {
    console.log('\n' + '='.repeat(80));
    console.log('🔄 STARTING USER SYNC FROM NETCORE API');
    console.log('='.repeat(80));
    console.log(`API Base: ${NETCORE_API_BASE}`);
    console.log(`MongoDB: ${MONGODB_URI}`);
    console.log(`Sync limit: ${SYNC_LIMIT} users`);
    console.log('='.repeat(80) + '\n');

    // Connect to MongoDB
    await client.connect();
    console.log('✅ Connected to MongoDB\n');

    const db = client.db('emma-sleep');

    // Step 1: Fetch users from API
    const userIds = await fetchAllUsers();
    if (userIds.length === 0) {
      console.log('❌ No users found. Exiting.');
      return;
    }

    // Step 2: Clear existing data
    await clearExistingData(db);

    // Step 3: Sync user details
    await syncUsers(db, userIds);

    // Step 4: Sync messages
    await syncMessages(db, userIds);

    // Generate report
    generateReport();

    await client.close();
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    syncStats.errors.push(`Fatal error: ${error.message}`);
    generateReport();
    process.exit(1);
  }
}

// Run the sync
syncUsersFromNetcore();

const { MongoClient } = require('mongodb');
const axios = require('axios');
const { type } = require('os');
require('dotenv').config();

const API_BASE = process.env.NETCORE_API_BASE_URL;
const APP_ID = process.env.NETCORE_APP_ID;
const APP_SECRET = process.env.NETCORE_APP_SECRET;
const MONGODB_URI = process.env.MONGODB_URI;

const SYNC_LIMIT = process.env.SYNC_LIMIT ? parseInt(process.env.SYNC_LIMIT) : 0; // 0 = fetch all
const MAX_PAGES = 250; // Safeguard: max 12,500 users (250 pages × 50 users)
const BATCH_SIZE = 100;
const CHANNEL_IDS = {
  webchat: 1010,
  whatsapp: 1014,
  telegram: 1016,
  facebook: 1017,
  instagram: 1021,
};

let authToken = null;
let syncStats = {
  usersLoaded: 0,
  usersInserted: 0,
  messagesInserted: 0,
  usersRemoved: 0,
  errors: [],
};

// Get date range for last 5 days (for fetching users)
function getDateRange() {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 5);

  return {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  };
}

// Authenticate and get token
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
    console.log(`   Expires: ${response.data.expiresAt}\n`);

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

// Fetch users from a single page
async function fetchUsersPage(pageNumber, pageSize = 50) {
  try {
    const { startDate, endDate } = getDateRange();

    const payload = {
      channelIds: [1010, 1014, 1016, 1017, 1021], // All channels
      startDate: startDate,
      endDate: endDate,
    };

    const endpoint = `/users?page=${pageNumber}&limit=${pageSize}`;
    const url = `${API_BASE}${endpoint}`;
    // console.log(`\n   🔗 URL: ${url}`);
    // console.log(`   📦 Payload: ${JSON.stringify(payload, null, 2)}`);

    const response = await callAPI(endpoint, 'POST', payload);

    let pageUsers = [];
    if (Array.isArray(response)) {
      pageUsers = response;
    } else if (response.data && Array.isArray(response.data)) {
      pageUsers = response.data;
    } else if (response.users && Array.isArray(response.users)) {
      pageUsers = response.users;
    }

    console.log(`   📄 Page ${pageNumber}: fetched ${pageUsers.length} users`);

    return {
      users: pageUsers,
      hasMore: pageUsers.length === pageSize, // If we got full page, there might be more
    };
  } catch (error) {
    const errMsg = error.response?.data?.message || error.message;
    console.error(`❌ Failed to fetch users page ${pageNumber}: ${errMsg}`);
    syncStats.errors.push(`Fetch page ${pageNumber}: ${errMsg}`);
    throw error;
  }
}

// Format user data from API response
function formatUserData(user) {
  return {
    userId: user.id || user.userId || user._id,
    botUserId: user.botUserId || user.phoneNumber || user.phone || '-',
    name: user.name || user.customerName || 'Unknown',
    email: user.email || null,
    phoneNumber: user.phoneNumber || user.phone || null,
    customFields: user.customFields || user.custom_fields || {},
    tags: user.tags || user.tag || [],
    channelName: user.channelName || user.channel || 'whatsapp',
    lastInteractedDate: user.lastInteractedDate || user['last interacted date'] || new Date(),
    createdAt: user.createdAt || user.createdDate || new Date(),
  };
}

// Move nested object properties to root level (one level deep only)
function flattenToRoot(obj) {
  let result = {};

  for (let key in obj) {
    if (obj.hasOwnProperty(key)) {
      const value = obj[key];

      if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        // Move nested object properties to root
        for (let nestedKey in value) {
          if (value.hasOwnProperty(nestedKey)) {
            result[nestedKey] = value[nestedKey];
          }
        }
      } else {
        result[key] = value;
      }
    }
  }

  return result;
}

// Fetch ALL messages for a user (all-time, no date restrictions)
async function fetchMessages(botUserId, channelId = 1014, customerId) {
  try {
    const payload = {
      botUserId: botUserId,
      channelId: channelId,
    };

    const response = await callAPI('/transcripts', 'POST', payload);

    let messages = [];
    if (Array.isArray(response)) {
      messages = response;
    } else if (response.data && Array.isArray(response.data)) {
      messages = response.data;
    } else if (response.transcripts && Array.isArray(response.transcripts)) {
      messages = response.transcripts;
    }

    const { ObjectId } = require('mongodb');

    return messages.map((msg, index) => {
      // Generate unique ID if not present
      let messageId = msg.id || msg._id;
      if (!messageId) {
        messageId = new ObjectId();
      }

      const messageRecord = {
        _id: messageId,
        customerId: customerId,
        botUserId: botUserId,
        createdAt: msg.createdAt,
        from: msg.from,
        isConfigMessage: msg.isConfigMessage,
        type: msg.type,
        [msg.type]: msg[msg.type],
      };

      
      return messageRecord
    });
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

// Sync users from a page
async function syncUsersPage(db, pageUsers, pageNumber) {
  try {
    const customersCollection = db.collection('customers');
    let upsertedCount = 0;

    for (const user of pageUsers) {
      const userData = formatUserData(user);

      const result = await customersCollection.updateOne(
        { userId: userData.userId },
        { $set: userData },
        { upsert: true }
      );

      if (result.upsertedId || result.modifiedCount > 0) {
        syncStats.usersInserted++;
        upsertedCount++;
      }
    }

    console.log(`   ✅ Page ${pageNumber}: upserted ${upsertedCount} users (total: ${syncStats.usersInserted})`);
    return pageUsers.map(user => formatUserData(user));
  } catch (error) {
    console.error(`   ❌ Upsert page ${pageNumber} error: ${error.message}`);
    syncStats.errors.push(`Upsert page ${pageNumber}: ${error.message}`);
    throw error;
  }
}

// Sync messages for a page of users
async function syncMessagesForPage(db, pageUsers, pageNumber) {
  const messagesCollection = db.collection('messages');
  const bulkOps = [];
  let pageMessageCount = 0;

  for (let i = 0; i < pageUsers.length; i++) {
    const botUserId = pageUsers[i].botUserId;
    const customerId = pageUsers[i].userId;

    if (!botUserId || botUserId === '-') {
      continue;
    }

    const messages = await fetchMessages(botUserId, 1014, customerId);

    if (messages.length > 0) {
      for (const message of messages) {
        bulkOps.push({
          updateOne: {
            filter: { _id: message._id },
            update: { $set: message },
            upsert: true,
          },
        });
        pageMessageCount++;
        syncStats.messagesInserted++;
      }
    }

    // Execute bulk every 500 messages to avoid memory issues
    if (bulkOps.length >= 500) {
      try {
        const result = await messagesCollection.bulkWrite(bulkOps);
        console.log(`   ℹ️  Bulk inserted ${bulkOps.length} messages`);
        bulkOps.length = 0;
      } catch (error) {
        syncStats.errors.push(`Bulk write error for page ${pageNumber}: ${error.message}`);
      }
    }

    if ((i + 1) % 10 === 0) {
      console.log(`   ℹ️  ${i + 1}/${pageUsers.length} users processed (${pageMessageCount} messages in page)`);
    }
  }

  // Execute remaining bulk ops
  if (bulkOps.length > 0) {
    try {
      const result = await messagesCollection.bulkWrite(bulkOps);
      console.log(`   ℹ️  Bulk inserted final ${bulkOps.length} messages`);
    } catch (error) {
      syncStats.errors.push(`Final bulk write error for page ${pageNumber}: ${error.message}`);
    }
  }

  console.log(`   ✅ Page ${pageNumber}: ${pageMessageCount} messages synced (total: ${syncStats.messagesInserted})`);
}

// Generate report
function generateReport() {
  const targetText = SYNC_LIMIT === 0 ? 'ALL' : SYNC_LIMIT;
  console.log('\n' + '='.repeat(80));
  console.log(`📊 SYNC REPORT - ${targetText} Users with All Messages`);
  console.log('='.repeat(80) + '\n');

  console.log('📈 Summary:');
  console.log(`   ✅ Users from API: ${syncStats.usersLoaded}`);
  console.log(`   ✅ Users inserted: ${syncStats.usersInserted}`);
  console.log(`   ✅ Messages inserted: ${syncStats.messagesInserted}`);
  console.log(`   ✅ Existing data removed: ${syncStats.usersRemoved}`);

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
async function syncAllMessages() {
  const client = new MongoClient(MONGODB_URI);

  try {
    const targetText = SYNC_LIMIT === 0 ? 'ALL' : SYNC_LIMIT;
    console.log('\n' + '='.repeat(80));
    console.log('🔄 SYNC USERS WITH ALL MESSAGES (PAGE BY PAGE)');
    console.log('='.repeat(80));
    console.log(`API: ${API_BASE}`);
    console.log(`Target: ${targetText} users from last 5 days`);
    console.log(`Messages: All-time (no date restrictions)`);
    console.log('='.repeat(80));

    // Step 0: Authenticate
    await getAuthToken();

    // Connect DB
    await client.connect();
    console.log('✅ Connected to MongoDB\n');

    const db = client.db('emma-sleep');

    // Step 1: Clear data
    await clearExistingData(db);

    // Step 2: Process pages sequentially
    console.log('\n📥 STEP 2: Fetching and syncing users page by page...\n');

    let pageNumber = 1;
    let totalProcessed = 0;
    let hasMorePages = true;

    while (hasMorePages && (SYNC_LIMIT === 0 || totalProcessed < SYNC_LIMIT) && pageNumber <= MAX_PAGES) {
      console.log(`\n${'='.repeat(80)}`);
      console.log(`📖 PAGE ${pageNumber}`);
      console.log('='.repeat(80));

      // Fetch page
      const { users: pageUsers, hasMore } = await fetchUsersPage(pageNumber);

      if (pageUsers.length === 0) {
        console.log('   ℹ️  No more users found');
        hasMorePages = false;
        break;
      }

      syncStats.usersLoaded += pageUsers.length;

      // Insert users from this page
      console.log(`\n   👥 Inserting users...`);
      const insertedUsers = await syncUsersPage(db, pageUsers, pageNumber);

      // Fetch messages for users in this page
      console.log(`\n   💬 Fetching messages for ${insertedUsers.length} users...`);
      await syncMessagesForPage(db, insertedUsers, pageNumber);

      totalProcessed += pageUsers.length;
      hasMorePages = hasMore && (SYNC_LIMIT === 0 || totalProcessed < SYNC_LIMIT);
      pageNumber++;
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log('✅ PAGE-BY-PAGE SYNC COMPLETE');
    console.log('='.repeat(80));

    // Report
    generateReport();

    await client.close();
  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    generateReport();
    process.exit(1);
  }
}

syncAllMessages();

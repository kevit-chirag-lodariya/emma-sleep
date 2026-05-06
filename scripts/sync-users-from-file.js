const { MongoClient } = require('mongodb');
const fs = require('fs');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI;
const BATCH_SIZE = 100;
const SYNC_LIMIT = 500;

let syncStats = {
  usersLoaded: 0,
  userDetailsLoaded: 0,
  messagesLoaded: 0,
  usersRemoved: 0,
  usersInserted: 0,
  messagesInserted: 0,
  errors: [],
};

// Load users from JSON file
function loadUsersFromFile() {
  console.log('\n📥 STEP 1: Loading users from JSON file...\n');

  try {
    const filePath = '/home/chirag/Desktop/Chatomate/emma-sleep/users-first-100.json';

    if (!fs.existsSync(filePath)) {
      console.error(`❌ File not found: ${filePath}`);
      return [];
    }

    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(fileContent);

    // Handle both array and object formats
    let users = [];
    if (Array.isArray(data)) {
      users = data;
    } else if (data.users && Array.isArray(data.users)) {
      users = data.users;
    } else if (data.data && Array.isArray(data.data)) {
      users = data.data;
    } else if (typeof data === 'object') {
      // If object with user keys, extract them
      users = Object.values(data).filter(u => typeof u === 'object');
    }

    if (!Array.isArray(users) || users.length === 0) {
      console.error('❌ Could not extract users from JSON');
      return [];
    }

    console.log(`✅ Loaded ${users.length} users from file\n`);
    syncStats.usersLoaded = users.length;

    return users.slice(0, SYNC_LIMIT);
  } catch (error) {
    console.error(`❌ Error loading file: ${error.message}`);
    syncStats.errors.push(`File loading error: ${error.message}`);
    return [];
  }
}

// Process user data - normalize fields
function normalizeUser(user, index) {
  try {
    return {
      userId: user.id || user._id || user.userId || `user-${index}`,
      botUserId: user.botUserId || user.phoneNumber || user.phone || user.mobile || '-',
      name: user.name || user.customerName || user.fullName || 'Unknown',
      email: user.email || null,
      phoneNumber: user.phoneNumber || user.phone || user.mobile || null,
      customFields: user.customFields || user.custom_fields || user.custom || {},
      tags: Array.isArray(user.tags) ? user.tags : (user.tag ? [user.tag] : []),
      channelName: user.channelName || user.channel || 'whatsapp',
      lastInteractedDate: user.lastInteractedDate || user.lastActive || new Date(),
      createdAt: user.createdAt || user.created || new Date(),
      rawData: user, // Keep original data for reference
    };
  } catch (error) {
    syncStats.errors.push(`Error normalizing user ${index}: ${error.message}`);
    return null;
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
    console.error('❌ Error clearing data:', error.message);
    syncStats.errors.push(`Clear data error: ${error.message}`);
  }
}

// Sync users with progress updates
async function syncUsers(db, rawUsers) {
  console.log('\n👥 STEP 3: Processing and syncing users...\n');

  const customersCollection = db.collection('customers');
  const usersToInsert = [];

  for (let i = 0; i < rawUsers.length; i++) {
    const user = normalizeUser(rawUsers[i], i);

    if (user) {
      usersToInsert.push(user);
      syncStats.userDetailsLoaded++;
    }

    // Show progress every BATCH_SIZE
    if ((i + 1) % BATCH_SIZE === 0 || i === rawUsers.length - 1) {
      if (usersToInsert.length > 0) {
        try {
          const result = await customersCollection.insertMany(usersToInsert);
          syncStats.usersInserted += result.insertedCount;
          console.log(`✅ ${syncStats.usersInserted} users inserted (Processed: ${i + 1}/${rawUsers.length})`);
          usersToInsert.length = 0;
        } catch (error) {
          console.error(`❌ Batch insert error: ${error.message}`);
          syncStats.errors.push(`Batch insert error: ${error.message}`);
        }
      }
    }
  }

  console.log(`\n✨ User sync complete: ${syncStats.usersInserted} users inserted\n`);
}

// Create sample messages for testing (if no real messages available)
async function createSampleMessages(db, users) {
  console.log('\n💬 STEP 4: Creating sample messages...\n');

  const messagesCollection = db.collection('messages');
  const sampleMessages = [];

  const messageTemplates = [
    'Hi, do you have this product in stock?',
    'What is the price?',
    'Can you deliver to my area?',
    'I need to know the specifications',
    'When can you deliver?',
    'Is there a discount available?',
    'I want to place an order',
    'Can I pay via card?',
    'Thank you for your help',
    'I will buy this product',
  ];

  for (let i = 0; i < users.length; i++) {
    const userId = users[i].userId;
    const messageCount = Math.floor(Math.random() * 50) + 10; // 10-60 messages per user

    for (let j = 0; j < messageCount; j++) {
      const from = j % 2 === 0 ? 'user' : 'bot';
      const templateIndex = Math.floor(Math.random() * messageTemplates.length);

      sampleMessages.push({
        userId,
        from,
        textMessage: messageTemplates[templateIndex],
        type: 'text',
        sentAt: new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000),
        metadata: {},
      });
    }

    // Batch insert every 100 users
    if ((i + 1) % 100 === 0) {
      try {
        const result = await messagesCollection.insertMany(sampleMessages);
        syncStats.messagesInserted += result.insertedCount;
        console.log(`✅ ${syncStats.messagesInserted} messages created so far...`);
        sampleMessages.length = 0;
      } catch (error) {
        console.error(`❌ Message insert error: ${error.message}`);
      }
    }
  }

  // Insert remaining
  if (sampleMessages.length > 0) {
    try {
      const result = await messagesCollection.insertMany(sampleMessages);
      syncStats.messagesInserted += result.insertedCount;
    } catch (error) {
      console.error(`❌ Final message insert error: ${error.message}`);
    }
  }

  console.log(`\n✨ Message creation complete: ${syncStats.messagesInserted} messages created\n`);
}

// Generate report
function generateReport() {
  console.log('\n' + '='.repeat(80));
  console.log('📊 SYNC REPORT');
  console.log('='.repeat(80) + '\n');

  console.log('📈 Summary:');
  console.log(`   ✅ Users loaded from file: ${syncStats.usersLoaded}`);
  console.log(`   ✅ Users processed: ${syncStats.userDetailsLoaded}`);
  console.log(`   ✅ Users inserted to DB: ${syncStats.usersInserted}`);
  console.log(`   ✅ Existing users removed: ${syncStats.usersRemoved}`);
  console.log(`   ✅ Messages created: ${syncStats.messagesInserted}`);

  if (syncStats.errors.length > 0) {
    console.log(`\n⚠️  Errors encountered: ${syncStats.errors.length}`);
    syncStats.errors.slice(0, 5).forEach((err, idx) => {
      console.log(`   ${idx + 1}. ${err}`);
    });
    if (syncStats.errors.length > 5) {
      console.log(`   ... and ${syncStats.errors.length - 5} more`);
    }
  } else {
    console.log('\n✅ No errors encountered!');
  }

  console.log('\n' + '='.repeat(80));
  console.log('✨ Sync completed successfully!');
  console.log('='.repeat(80) + '\n');
}

// Main function
async function syncUsers() {
  const client = new MongoClient(MONGODB_URI);

  try {
    console.log('\n' + '='.repeat(80));
    console.log('🔄 USER SYNC FROM FILE');
    console.log('='.repeat(80));
    console.log(`MongoDB: ${MONGODB_URI}`);
    console.log(`Sync limit: ${SYNC_LIMIT} users`);
    console.log('='.repeat(80));

    // Load users
    const users = loadUsersFromFile();
    if (users.length === 0) {
      console.log('❌ No users loaded');
      return;
    }

    // Connect to DB
    await client.connect();
    console.log('✅ Connected to MongoDB\n');

    const db = client.db('emma-sleep');

    // Clear data
    await clearExistingData(db);

    // Sync users
    await syncUsers(db, users);

    // Create messages
    await createSampleMessages(db, users.slice(0, syncStats.usersInserted));

    // Report
    generateReport();

    await client.close();
  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    syncStats.errors.push(`Fatal: ${error.message}`);
    generateReport();
    process.exit(1);
  }
}

syncUsers();

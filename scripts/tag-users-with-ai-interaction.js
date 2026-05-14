const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

// Load .env file
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach((line) => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      const value = valueParts.join('=');
      if (!process.env[key.trim()]) {
        process.env[key.trim()] = value.trim();
      }
    }
  });
}

const uri = 'mongodb://localhost:27017';
const dbName = 'emma-sleep';

async function tagUsersWithAIInteraction() {
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('Connected to MongoDB\n');

    const db = client.db(dbName);
    const messagesCollection = db.collection('messages');
    const customersCollection = db.collection('customers');

    console.log('Finding users with aiAgent/Bot interactions...\n');

    // Get all distinct customerIds that have messages from aiAgent or Bot
    const usersWithAIMessages = await messagesCollection
      .distinct('customerId', { from: { $in: ['aiAgent'] } });

    console.log(`Found ${usersWithAIMessages.length} users with AI interactions\n`);

    let taggedCount = 0;
    let alreadyTaggedCount = 0;
    let errorCount = 0;

    // Process each user
    for (let i = 0; i < usersWithAIMessages.length; i++) {
      const customerId = usersWithAIMessages[i];

      try {
        // Get user details - customerId matches userId field in customers collection
        const user = await customersCollection.findOne({ userId: customerId });

        if (!user) {
          // Customer doesn't exist yet, skip
          continue;
        }

        // Check if ai-used tag already exists
        const hasAIUsedTag = user.tags && user.tags.includes('ai-used');

        if (hasAIUsedTag) {
          alreadyTaggedCount++;
          continue;
        }

        // Add ai-used tag
        const currentTags = user.tags || [];
        const newTags = [...new Set([...currentTags, 'ai-used'])]; // Remove duplicates

        const updateResult = await customersCollection.updateOne(
          { userId: customerId },
          { $set: { tags: newTags } }
        );

        if (updateResult.modifiedCount > 0) {
          taggedCount++;
          if ((taggedCount + alreadyTaggedCount) % 50 === 0) {
            console.log(`✅ Processed ${taggedCount + alreadyTaggedCount}/${usersWithAIMessages.length} users...`);
          }
        }
      } catch (error) {
        errorCount++;
        console.error(`❌ Error processing user ${customerId}:`, error.message);
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('TAGGING SUMMARY');
    console.log('='.repeat(80));
    console.log(`✅ New users tagged with ai-used: ${taggedCount}`);
    console.log(`⏭️  Already had ai-used tag: ${alreadyTaggedCount}`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log(`📊 Total users processed: ${taggedCount + alreadyTaggedCount + errorCount}/${usersWithAIMessages.length}`);
    console.log('\n✅ AI interaction tagging completed!\n');

    await client.close();
  } catch (error) {
    console.error('Error:', error);
  }
}

tagUsersWithAIInteraction();

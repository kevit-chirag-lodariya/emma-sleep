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

async function setupIndexes() {
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('Connected to MongoDB\n');

    const db = client.db(dbName);
    const customersCollection = db.collection('customers');

    console.log('Setting up indexes for classification fields...\n');

    // Index on classification.conversation_type
    await customersCollection.createIndex({ 'classification.conversation_type': 1 });
    console.log('✅ Index created: classification.conversation_type');

    // Index on classification.sales_sub_type
    await customersCollection.createIndex({ 'classification.sales_sub_type': 1 });
    console.log('✅ Index created: classification.sales_sub_type');

    // Index on classification.support_sub_type
    await customersCollection.createIndex({ 'classification.support_sub_type': 1 });
    console.log('✅ Index created: classification.support_sub_type');

    // Index on classification.funnel_stage_reached
    await customersCollection.createIndex({ 'classification.funnel_stage_reached': 1 });
    console.log('✅ Index created: classification.funnel_stage_reached');

    // Index on classification.resolution_signal
    await customersCollection.createIndex({ 'classification.resolution_signal': 1 });
    console.log('✅ Index created: classification.resolution_signal');

    // Index on classification.order_placed
    await customersCollection.createIndex({ 'classification.order_placed': 1 });
    console.log('✅ Index created: classification.order_placed');

    // Index on classification.escalated_to_human
    await customersCollection.createIndex({ 'classification.escalated_to_human': 1 });
    console.log('✅ Index created: classification.escalated_to_human');

    // Index on classification.classifier_confidence
    await customersCollection.createIndex({ 'classification.classifier_confidence': 1 });
    console.log('✅ Index created: classification.classifier_confidence');

    // Compound index for common queries
    await customersCollection.createIndex({
      'classification.conversation_type': 1,
      'classification.classifier_confidence': 1,
    });
    console.log('✅ Compound index created: conversation_type + classifier_confidence');

    // Index on tags (for filtering)
    await customersCollection.createIndex({ tags: 1 });
    console.log('✅ Index created: tags');

    // Index on classifiedAt (for sorting)
    await customersCollection.createIndex({ classifiedAt: 1 });
    console.log('✅ Index created: classifiedAt');

    console.log('\n✅ All indexes created successfully!');

    // List all indexes
    const indexes = await customersCollection.listIndexes().toArray();
    console.log(`\nTotal indexes: ${indexes.length}`);

    await client.close();
  } catch (error) {
    console.error('Error:', error);
  }
}

setupIndexes();

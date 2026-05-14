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

async function backupClassificationData() {
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('Connected to MongoDB\n');

    const db = client.db(dbName);
    const customersCollection = db.collection('customers');

    // Get all users with classification data
    const classifiedUsers = await customersCollection
      .find({ classification: { $exists: true } })
      .toArray();

    if (classifiedUsers.length === 0) {
      console.log('✅ No classified users found to backup.\n');
      await client.close();
      return;
    }

    // Create backup directory
    const backupDir = path.join(__dirname, '..', 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    // Create backup file with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const backupFileName = `classification_backup_${timestamp}.json`;
    const backupPath = path.join(backupDir, backupFileName);

    // Save backup
    fs.writeFileSync(backupPath, JSON.stringify(classifiedUsers, null, 2));

    console.log('='.repeat(80));
    console.log('CLASSIFICATION DATA BACKUP COMPLETED');
    console.log('='.repeat(80));
    console.log(`\n✅ Backup saved: ${backupPath}`);
    console.log(`📊 Total classified users backed up: ${classifiedUsers.length}`);

    // Create metadata file
    const metadata = {
      backupDate: new Date().toISOString(),
      totalUsers: classifiedUsers.length,
      conversationTypes: {},
      salesSubTypes: {},
      supportSubTypes: {},
    };

    classifiedUsers.forEach((user) => {
      const type = user.classification.conversation_type;
      metadata.conversationTypes[type] = (metadata.conversationTypes[type] || 0) + 1;

      if (user.classification.sales_sub_type) {
        const subType = user.classification.sales_sub_type;
        metadata.salesSubTypes[subType] = (metadata.salesSubTypes[subType] || 0) + 1;
      }

      if (user.classification.support_sub_type) {
        const subType = user.classification.support_sub_type;
        metadata.supportSubTypes[subType] = (metadata.supportSubTypes[subType] || 0) + 1;
      }
    });

    const metadataPath = path.join(backupDir, `classification_metadata_${timestamp}.json`);
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

    console.log(`📋 Metadata saved: ${metadataPath}`);
    console.log('\nBreakdown:');
    console.log(`  Conversation Types: ${JSON.stringify(metadata.conversationTypes)}`);
    console.log(`  Sales Sub-Types: ${JSON.stringify(metadata.salesSubTypes)}`);
    console.log(`  Support Sub-Types: ${JSON.stringify(metadata.supportSubTypes)}`);

    console.log('\n✅ Backup completed successfully!\n');

    await client.close();
  } catch (error) {
    console.error('Error:', error);
  }
}

backupClassificationData();

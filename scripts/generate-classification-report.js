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

async function generateReport() {
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('Connected to MongoDB\n');

    const db = client.db(dbName);
    const customersCollection = db.collection('customers');

    // Get all classified users
    const classifiedUsers = await customersCollection
      .find({ classification: { $exists: true } })
      .toArray();

    const totalClassified = classifiedUsers.length;
    console.log('='.repeat(100));
    console.log('EMMA SLEEP INTENT CLASSIFICATION REPORT');
    console.log('='.repeat(100));
    console.log(`Generated: ${new Date().toISOString()}`);
    console.log(`Total Classified Users: ${totalClassified}\n`);

    if (totalClassified === 0) {
      console.log('⚠️  No classified users found. Run analyze-with-openai.js first.\n');
      await client.close();
      return;
    }

    // Conversation Type Distribution
    const typeDistribution = {};
    classifiedUsers.forEach((user) => {
      const type = user.classification.conversation_type;
      typeDistribution[type] = (typeDistribution[type] || 0) + 1;
    });

    console.log('📊 CONVERSATION TYPE DISTRIBUTION');
    console.log('-'.repeat(100));
    Object.entries(typeDistribution).forEach(([type, count]) => {
      const percentage = ((count / totalClassified) * 100).toFixed(1);
      const bar = '█'.repeat(Math.round(percentage / 2)) + '░'.repeat(50 - Math.round(percentage / 2));
      console.log(`  ${type.padEnd(15)} | ${bar} | ${count.toString().padEnd(4)} (${percentage}%)`);
    });

    // Sales Sub-type Distribution
    const salesUsers = classifiedUsers.filter((u) => u.classification.conversation_type === 'sales');
    if (salesUsers.length > 0) {
      const salesSubTypeDistribution = {};
      salesUsers.forEach((user) => {
        const subType = user.classification.sales_sub_type || 'unset';
        salesSubTypeDistribution[subType] = (salesSubTypeDistribution[subType] || 0) + 1;
      });

      console.log('\n📈 SALES SUB-TYPE DISTRIBUTION');
      console.log('-'.repeat(100));
      Object.entries(salesSubTypeDistribution).forEach(([subType, count]) => {
        const percentage = ((count / salesUsers.length) * 100).toFixed(1);
        console.log(`  ${subType.padEnd(20)} | ${count.toString().padEnd(4)} (${percentage}%)`);
      });
    }

    // Support Sub-type Distribution
    const supportUsers = classifiedUsers.filter((u) => u.classification.conversation_type === 'support');
    if (supportUsers.length > 0) {
      const supportSubTypeDistribution = {};
      supportUsers.forEach((user) => {
        const subType = user.classification.support_sub_type || 'unset';
        supportSubTypeDistribution[subType] = (supportSubTypeDistribution[subType] || 0) + 1;
      });

      console.log('\n🛠️  SUPPORT SUB-TYPE DISTRIBUTION');
      console.log('-'.repeat(100));
      Object.entries(supportSubTypeDistribution).forEach(([subType, count]) => {
        const percentage = ((count / supportUsers.length) * 100).toFixed(1);
        console.log(`  ${subType.padEnd(20)} | ${count.toString().padEnd(4)} (${percentage}%)`);
      });
    }

    // Funnel Stage Distribution
    const withFunnelStage = classifiedUsers.filter((u) => u.classification.funnel_stage_reached);
    if (withFunnelStage.length > 0) {
      const funnelDistribution = {};
      withFunnelStage.forEach((user) => {
        const stage = user.classification.funnel_stage_reached;
        funnelDistribution[stage] = (funnelDistribution[stage] || 0) + 1;
      });

      console.log('\n🎯 FUNNEL STAGE DISTRIBUTION');
      console.log('-'.repeat(100));
      const funnelOrder = ['greeting', 'need_discovery', 'product_shown', 'price_shared', 'checkout_intent', 'ordered'];
      funnelOrder.forEach((stage) => {
        if (funnelDistribution[stage]) {
          const count = funnelDistribution[stage];
          const percentage = ((count / withFunnelStage.length) * 100).toFixed(1);
          console.log(`  ${stage.padEnd(20)} | ${count.toString().padEnd(4)} (${percentage}%)`);
        }
      });
    }

    // Resolution Signal Distribution
    const withResolution = classifiedUsers.filter((u) => u.classification.resolution_signal);
    if (withResolution.length > 0) {
      const resolutionDistribution = {};
      withResolution.forEach((user) => {
        const signal = user.classification.resolution_signal;
        resolutionDistribution[signal] = (resolutionDistribution[signal] || 0) + 1;
      });

      console.log('\n✅ RESOLUTION SIGNAL DISTRIBUTION');
      console.log('-'.repeat(100));
      Object.entries(resolutionDistribution).forEach(([signal, count]) => {
        const percentage = ((count / withResolution.length) * 100).toFixed(1);
        console.log(`  ${signal.padEnd(20)} | ${count.toString().padEnd(4)} (${percentage}%)`);
      });
    }

    // Confidence Distribution
    const confidenceDistribution = {};
    classifiedUsers.forEach((user) => {
      const conf = user.classification.classifier_confidence;
      confidenceDistribution[conf] = (confidenceDistribution[conf] || 0) + 1;
    });

    console.log('\n🔍 CLASSIFIER CONFIDENCE DISTRIBUTION');
    console.log('-'.repeat(100));
    ['high', 'medium', 'low'].forEach((level) => {
      if (confidenceDistribution[level]) {
        const count = confidenceDistribution[level];
        const percentage = ((count / totalClassified) * 100).toFixed(1);
        const emoji = level === 'high' ? '🟢' : level === 'medium' ? '🟡' : '🔴';
        console.log(`  ${emoji} ${level.padEnd(18)} | ${count.toString().padEnd(4)} (${percentage}%)`);
      }
    });

    // Order Placed Summary
    const orderPlaced = classifiedUsers.filter((u) => u.classification.order_placed).length;
    const escalated = classifiedUsers.filter((u) => u.classification.escalated_to_human).length;

    console.log('\n✔️  KEY METRICS');
    console.log('-'.repeat(100));
    console.log(`  ✅ Order Placed: ${orderPlaced} (${((orderPlaced / totalClassified) * 100).toFixed(1)}%)`);
    console.log(`  🤝 Escalated to Human: ${escalated} (${((escalated / totalClassified) * 100).toFixed(1)}%)`);

    // Top Tags
    const allTags = {};
    classifiedUsers.forEach((user) => {
      if (user.tags && Array.isArray(user.tags)) {
        user.tags.forEach((tag) => {
          allTags[tag] = (allTags[tag] || 0) + 1;
        });
      }
    });

    console.log('\n🏷️  TOP TAGS');
    console.log('-'.repeat(100));
    Object.entries(allTags)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .forEach(([tag, count]) => {
        const percentage = ((count / totalClassified) * 100).toFixed(1);
        console.log(`  ${tag.padEnd(25)} | ${count.toString().padEnd(4)} (${percentage}%)`);
      });

    // Low Confidence Users (require human review)
    const lowConfidenceUsers = classifiedUsers.filter((u) => u.classification.classifier_confidence === 'low');
    if (lowConfidenceUsers.length > 0) {
      console.log('\n⚠️  LOW CONFIDENCE CLASSIFICATIONS (REQUIRE HUMAN REVIEW)');
      console.log('-'.repeat(100));
      lowConfidenceUsers.slice(0, 10).forEach((user, idx) => {
        console.log(`  ${idx + 1}. ${user.userId} (${user.botUserId || user.customFields?.phone || 'N/A'})`);
        console.log(`     Type: ${user.classification.conversation_type} | Notes: ${user.classification.classifier_notes || 'None'}`);
      });
      if (lowConfidenceUsers.length > 10) {
        console.log(`  ... and ${lowConfidenceUsers.length - 10} more low confidence classifications`);
      }
    }

    console.log('\n' + '='.repeat(100));
    console.log('Report generated successfully!\n');

    await client.close();
  } catch (error) {
    console.error('Error:', error);
  }
}

generateReport();

const { MongoClient } = require('mongodb');
const OpenAI = require('openai');
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

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function analyzeUserWithOpenAI(userId, phoneNumber, userName, messages) {
  try {
    // Prepare conversation transcript
    const transcript = messages
      .map((msg) => {
        const sender = msg.from === 'user' ? 'Customer' : 'Bot';
        const text = msg.textMessage || msg.replyBody || msg.listBody || msg.type || '';
        return `${sender}: ${text}`;
      })
      .join('\n');

    const analysisPrompt = `You are an expert sales analyst and customer behavior specialist. Analyze this customer support/sales conversation transcript and provide detailed insights.

CUSTOMER INFO:
- Phone: ${phoneNumber}
- Name: ${userName}
- Message Count: ${messages.length}

TRANSCRIPT:
${transcript}

Please analyze and respond in VALID JSON format (no markdown, no extra text) with the following structure:
{
  "tags": ["array", "of", "tags"],
  "userIntent": "primary intent (buy/support/inquiry/comparison/other)",
  "purchaseIntent": "high/medium/low/none",
  "supportNeeded": "yes/no",
  "conversionStatus": "completed/dropped/in-progress/not-applicable",
  "droppedReason": "reason if dropped, null otherwise",
  "droppedAt": "where in funnel (product-browsing/product-selection/product-details/payment/checkout/other/not-applicable)",
  "productInterest": ["array", "of", "products"],
  "concerns": ["array", "of", "concerns"],
  "sentiment": "positive/neutral/negative",
  "engagementLevel": "high/medium/low",
  "salesInsights": "2-3 sentence summary of sales opportunity and recommendations",
  "followUpActions": ["recommended", "next", "steps"]
}

CRITICAL TAG RULES - Always include appropriate tags:
- "ai-used": ALWAYS include (AI agent was involved)
- "come-to-buy": if customer shows purchase intent
- "come-to-support": if customer has support/complaint/issue needs
- "buy": if payment was made, confirmed, or completed
- "conversion-completed": if transaction or goal was successfully completed
- "dropped": if customer abandoned without completing their goal
- "dropped-at-payment": if dropped at payment stage specifically
- "dropped-at-product-selection": if dropped while selecting products
- "dropped-at-support": if support issue remained unresolved
- Include any other relevant custom tags based on deep analysis

Return ONLY the JSON object, nothing else.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: analysisPrompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 1500,
    });

    const responseText = completion.choices[0].message.content;

    // Parse JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('Response:', responseText);
      throw new Error('Could not parse JSON from OpenAI response');
    }

    const analysis = JSON.parse(jsonMatch[0]);
    return analysis;
  } catch (error) {
    console.error(`Error analyzing user ${userId}:`, error.message);
    return null;
  }
}

async function processUsersWithOpenAI() {
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('Connected to MongoDB\n');

    const db = client.db(dbName);
    const messagesCollection = db.collection('messages');
    const customersCollection = db.collection('customers');

    // Get first 10 users with ai-used tag
    const users = await customersCollection
      .find({ tags: 'ai-used' })
      .limit(10)
      .project({ userId: 1, botUserId: 1, name: 1, customFields: 1 })
      .toArray();

    console.log(`Processing ${users.length} users with OpenAI (GPT-4o mini)...\n`);
    console.log('='.repeat(80));

    const results = [];

    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      const phoneNumber = user.botUserId || user.customFields?.phone || 'N/A';

      console.log(`\n[${i + 1}/${users.length}] Analyzing user: ${user.userId}`);
      console.log(`Phone: ${phoneNumber} | Name: ${user.name || 'N/A'}`);

      // Get all messages for this user
      const messages = await messagesCollection
        .find({ userId: user.userId, isConfigMessage: false }, { projection: { isFromAgent: 0, action: 0, flowId: 0, flowName:0,isPreviewUser:0,isTemplateSentFromFlow:0,sentAt:0,source:0,messageDetails:0,timestamp:0 } })
        .sort({ createdAt: 1 })
        .toArray();

      console.log(`Messages: ${messages.length}`);
      console.log('Analyzing with OpenAI...');

      // Analyze with OpenAI
      const analysis = await analyzeUserWithOpenAI(
        user.userId,
        phoneNumber,
        user.name,
        messages
      );

      if (!analysis) {
        console.log('⚠️  Failed to analyze user');
        continue;
      }

      // Update user with tags
      const updateResult = await customersCollection.updateOne(
        { userId: user.userId },
        { $set: { tags: analysis.tags } }
      );

      console.log(`✅ Tags Updated: [${analysis.tags.join(', ')}]`);
      console.log(`📊 User Intent: ${analysis.userIntent}`);
      console.log(`📈 Purchase Intent: ${analysis.purchaseIntent}`);
      console.log(`🎯 Conversion Status: ${analysis.conversionStatus}`);

      if (analysis.droppedReason) {
        console.log(`❌ Dropped Reason: ${analysis.droppedReason}`);
        console.log(`⏸️  Dropped At: ${analysis.droppedAt}`);
      }

      if (analysis.productInterest.length > 0) {
        console.log(`🛍️  Product Interest: ${analysis.productInterest.join(', ')}`);
      }

      if (analysis.concerns.length > 0) {
        console.log(`⚠️  Concerns: ${analysis.concerns.join(', ')}`);
      }

      console.log(`😊 Sentiment: ${analysis.sentiment}`);
      console.log(`🎯 Engagement: ${analysis.engagementLevel}`);
      console.log(`\n💡 Sales Insights:\n   ${analysis.salesInsights}`);

      if (analysis.followUpActions.length > 0) {
        console.log(`\n📋 Follow-up Actions:`);
        analysis.followUpActions.forEach((action, idx) => {
          console.log(`   ${idx + 1}. ${action}`);
        });
      }

      results.push({
        userId: user.userId,
        phone: phoneNumber,
        name: user.name,
        messageCount: messages.length,
        ...analysis,
      });

      console.log('-'.repeat(80));
    }

    // Summary Report
    console.log('\n' + '='.repeat(80));
    console.log('SUMMARY REPORT');
    console.log('='.repeat(80) + '\n');

    // Create summary table
    console.log('User Analysis Summary:');
    console.log('-'.repeat(120));
    console.log(
      '%-15s | %-20s | %-15s | %-18s | %-20s | %-15s'.replace(/%/g, '')
        .split('|')
        .map((s) => s.trim())
        .join(' | ')
    );

    results.forEach((r) => {
      const phone = r.phone.substring(0, 14);
      const name = (r.name || 'N/A').substring(0, 19);
      const intent = r.userIntent.substring(0, 14);
      const status = r.conversionStatus.substring(0, 17);
      const reason = (r.droppedReason || '-').substring(0, 19);
      const purchase = r.purchaseIntent.substring(0, 14);

      console.log(
        `${phone.padEnd(15)} | ${name.padEnd(20)} | ${intent.padEnd(15)} | ${status.padEnd(18)} | ${reason.padEnd(20)} | ${purchase.padEnd(15)}`
      );
    });

    // Sales Insights Summary
    console.log('\n\n' + '='.repeat(80));
    console.log('DETAILED SALES INSIGHTS & RECOMMENDATIONS');
    console.log('='.repeat(80) + '\n');

    results.forEach((r, idx) => {
      console.log(`${idx + 1}. ${r.phone} (${r.name})`);
      console.log(`   Messages: ${r.messageCount} | Engagement: ${r.engagementLevel} | Sentiment: ${r.sentiment}`);
      console.log(`   Product Interest: ${r.productInterest.join(', ') || 'None'}`);
      console.log(`   Concerns: ${r.concerns.join(', ') || 'None'}`);
      console.log(`\n   📊 ${r.salesInsights}`);

      if (r.followUpActions.length > 0) {
        console.log(`\n   📋 Recommended Actions:`);
        r.followUpActions.forEach((action, idx) => {
          console.log(`      ${idx + 1}. ${action}`);
        });
      }
      console.log('\n' + '-'.repeat(80) + '\n');
    });

    // Statistics
    console.log('\n' + '='.repeat(80));
    console.log('STATISTICS');
    console.log('='.repeat(80) + '\n');

    const stats = {
      totalUsers: results.length,
      completed: results.filter((r) => r.conversionStatus === 'completed').length,
      dropped: results.filter((r) => r.conversionStatus === 'dropped').length,
      inProgress: results.filter((r) => r.conversionStatus === 'in-progress').length,
      highPurchaseIntent: results.filter((r) => r.purchaseIntent === 'high').length,
      mediumPurchaseIntent: results.filter((r) => r.purchaseIntent === 'medium').length,
      positivesentiment: results.filter((r) => r.sentiment === 'positive').length,
      negativesentiment: results.filter((r) => r.sentiment === 'negative').length,
    };

    console.log(`Total Users Analyzed: ${stats.totalUsers}`);
    console.log(`✅ Conversions Completed: ${stats.completed} (${((stats.completed / stats.totalUsers) * 100).toFixed(1)}%)`);
    console.log(`❌ Dropped: ${stats.dropped} (${((stats.dropped / stats.totalUsers) * 100).toFixed(1)}%)`);
    console.log(`⏳ In Progress: ${stats.inProgress} (${((stats.inProgress / stats.totalUsers) * 100).toFixed(1)}%)`);
    console.log(`\n📈 High Purchase Intent: ${stats.highPurchaseIntent} (${((stats.highPurchaseIntent / stats.totalUsers) * 100).toFixed(1)}%)`);
    console.log(`📊 Medium Purchase Intent: ${stats.mediumPurchaseIntent} (${((stats.mediumPurchaseIntent / stats.totalUsers) * 100).toFixed(1)}%)`);
    console.log(`\n😊 Positive Sentiment: ${stats.positivesentiment} (${((stats.positivesentiment / stats.totalUsers) * 100).toFixed(1)}%)`);
    console.log(`😞 Negative Sentiment: ${stats.negativesentiment} (${((stats.negativesentiment / stats.totalUsers) * 100).toFixed(1)}%)`);

    console.log('\n✅ User tagging and analysis completed!');

    await client.close();
  } catch (error) {
    console.error('Error:', error);
  }
}

processUsersWithOpenAI();

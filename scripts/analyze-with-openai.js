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

const BUY_MATTRESS_OPTION = 'Buy Mattress on Whatsapp';
const SUPPORT_MENU_OPTIONS = ['Mattresses', 'Find nearby store 📍', 'Pillows', 'Protector'];

function getUserSelectedOptions(messages) {
  return messages
    .filter((m) => m.from === 'User' || m.from === 'user')
    .map((m) => m.text?.message || '')
    .filter(Boolean);
}

// Generate tags based on classification
function generateTags(analysis, messages = []) {
  const tags = [];

  // Always add ai-used
  tags.push('ai-used');

  // come-to-buy / come-to-support based on which menu option the user selected
  const userSelections = getUserSelectedOptions(messages);
  const selectedBuy = userSelections.includes(BUY_MATTRESS_OPTION);
  const selectedSupport = userSelections.some((s) => SUPPORT_MENU_OPTIONS.includes(s));

  if (selectedBuy) tags.push('come-to-buy');
  if (selectedSupport) tags.push('come-to-support');

  // Sub-type specific tags
  if (analysis.sales_sub_type === 'repeat_buyer') {
    tags.push('repeat-customer');
  }

  // Order and conversion tags
  if (analysis.order_placed) {
    tags.push('buy');
    tags.push('conversion-completed');
  }

  if (analysis.conversation_type === 'sales' && analysis.sales_sub_type === 'abandoned') {
    tags.push('dropped');
    if (analysis.funnel_stage_reached === 'checkout_intent') {
      tags.push('dropped-at-payment');
    } else if (analysis.funnel_stage_reached === 'product_shown' || analysis.funnel_stage_reached === 'need_discovery') {
      tags.push('dropped-at-product-selection');
    }
  }

  if (analysis.conversation_type === 'support' && analysis.resolution_signal === 'unresolved') {
    tags.push('dropped-at-support');
  }

  if (analysis.escalated_to_human) {
    tags.push('escalated-to-human');
  }

  // Support-specific tags
  if (analysis.support_sub_type === 'delivery') {
    tags.push('delivery-issue');
  } else if (analysis.support_sub_type === 'return_refund') {
    tags.push('return-request');
  } else if (analysis.support_sub_type === 'product_quality') {
    tags.push('quality-complaint');
  } else if (analysis.support_sub_type === 'warranty') {
    tags.push('warranty-claim');
  }

  return [...new Set(tags)]; // Remove duplicates
}

async function analyzeUserWithOpenAI(userId, phoneNumber, userName, messages) {
  try {
    // Prepare conversation transcript
    const transcript = messages
      .map((msg) => {
        const sender = msg.from === 'user' ? 'user' : 'aiAgent';
        const text = msg.textMessage || msg.replyBody || msg.listBody || msg.type || '';
        return `[${sender}] ${text}`;
      })
      .join('\n');

    const systemPrompt = `You are a conversation classifier for Emma Sleep India's WhatsApp sales and support bot. Emma Sleep sells premium mattresses (starting ~₹9,599) and sleep accessories in India. You will receive the complete conversation between a customer ('user') and the WhatsApp bot ('aiAgent'). Read ALL messages — both user and aiAgent — to understand the full context before classifying. Your classification is INTENT-BASED. You determine what the person is TRYING TO ACHIEVE — not which keywords they used.

CLASSIFICATION STAGES (complete in this order):
STAGE 1 — conversation_type:
  'sales': Person's primary purpose is to evaluate or purchase a product. They do not yet have a product from this conversation.
  'support': Person already ordered or received a product and needs help with a post-purchase issue.
  'mixed': Conversation substantively addresses BOTH buying AND a post-purchase issue. Both threads must have 3+ user messages.
  'unclassified': No classifiable intent. Fewer than 3 user messages with no clear purpose, or completely unrelated to Emma Sleep.

STAGE 2 — sub-type:
  Sales sub-types:
    'new_inquiry': First-time buyer exploring products
    'repeat_buyer': Prior Emma customer buying again
    'abandoned': Showed buying intent but no order was confirmed
  Support sub-types:
    'delivery': Issue with receiving the ordered product
    'return_refund': Wants to return product or get a refund
    'product_quality': Problem with the received product's quality or comfort
    'warranty': Invoking the 15-year warranty for replacement/repair
    'payment_order': Payment issue, double charge, invoice, order cancellation
    'general': Post-purchase query not in any above category

STAGE 3 — outcome labels:
  funnel_stage_reached (sales/mixed only — deepest stage reached):
    'greeting': Only initial exchange, no product or need discussed
    'need_discovery': Person communicated a need, bot gathered info
    'product_shown': Bot presented a specific product recommendation
    'price_shared': Specific price was communicated
    'checkout_intent': Person expressed intent to buy or bot sent checkout info
    'ordered': Unambiguous evidence order was placed
  resolution_signal (support/mixed only):
    'resolved': Issue addressed and person's response signals satisfaction
    'unresolved': Issue raised but person left without satisfaction
    'escalated': Bot transferred person to human agent
    'unknown': Conversation ended without enough signal to determine outcome

IMPORTANT RULES:
1. Read the aiAgent messages — they reveal context the user messages may not.
2. When intent is ambiguous, pick the SINGLE MOST LIKELY classification.
3. order_placed = true requires explicit confirmation — not just intent.
4. Set classifier_confidence: 'high' (all clear), 'medium' (one-two judgment calls), 'low' (unclear).
5. classifier_notes: Required when confidence is medium/low or when conversation_type is 'mixed'/'unclassified'.

Respond ONLY with a valid JSON object. No explanation outside the JSON.`;

const analysisPrompt = `Classify this conversation:
customerId: ${userId}
Phone: ${phoneNumber}
Name: ${userName}
Message Count: ${messages.length}

Messages (chronological order):
${transcript}

Output the classification in this JSON format:
{
  "conversation_type": "sales|support|mixed|unclassified",
  "sales_sub_type": "new_inquiry|repeat_buyer|abandoned|null",
  "support_sub_type": "delivery|return_refund|product_quality|warranty|payment_order|general|null",
  "funnel_stage_reached": "greeting|need_discovery|product_shown|price_shared|checkout_intent|ordered|null",
  "resolution_signal": "resolved|unresolved|escalated|unknown|null",
  "order_placed": boolean,
  "escalated_to_human": boolean,
  "objection_keywords": ["array", "of", "exact", "phrases"],
  "classifier_confidence": "high|medium|low",
  "classifier_notes": "explanation or empty string"
}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
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

    // Get customerIds that have messages from aiAgent or Bot
    const customersWithAIMessages = await messagesCollection
      .distinct('customerId', { from: { $in: ['aiAgent', 'Bot'] } });

    // Get first 10 customer records for those users
    const users = await customersCollection
      .find({ userId: { $in: customersWithAIMessages } })
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
        .find({ customerId: user.userId, isConfigMessage: false }, { projection: { isFromAgent: 0, action: 0, flowId: 0, flowName:0,isPreviewUser:0,isTemplateSentFromFlow:0,sentAt:0,source:0,messageDetails:0,timestamp:0 } })
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

      // Generate tags based on classification
      const tags = generateTags(analysis, messages);

      // Update user with classification data
      const updateResult = await customersCollection.updateOne(
        { userId: user.userId },
        {
          $set: {
            classification: analysis,
            tags: tags,
            classifiedAt: new Date(),
          },
        }
      );

      console.log(`✅ Classification: ${analysis.conversation_type}`);
      console.log(`📊 Type: ${analysis.conversation_type} | Sub-type: ${analysis.sales_sub_type || analysis.support_sub_type || 'N/A'}`);
      console.log(`🎯 Funnel Stage: ${analysis.funnel_stage_reached || 'N/A'} | Resolution: ${analysis.resolution_signal || 'N/A'}`);
      console.log(`📋 Order Placed: ${analysis.order_placed} | Escalated: ${analysis.escalated_to_human}`);
      console.log(`🔍 Confidence: ${analysis.classifier_confidence}`);

      if (analysis.objection_keywords.length > 0) {
        console.log(`⚠️  Objections: [${analysis.objection_keywords.join(', ')}]`);
      }

      if (analysis.classifier_notes) {
        console.log(`📝 Notes: ${analysis.classifier_notes}`);
      }

      console.log(`✏️  Tags: [${tags.join(', ')}]`);

      results.push({
        userId: user.userId,
        phone: phoneNumber,
        name: user.name,
        messageCount: messages.length,
        classification: analysis,
        tags: tags,
      });

      console.log('-'.repeat(80));
    }

    // Summary Report
    console.log('\n' + '='.repeat(100));
    console.log('EMMA SLEEP INTENT CLASSIFICATION SUMMARY');
    console.log('='.repeat(100) + '\n');

    // Create summary table
    console.log('Classification Summary:');
    console.log('-'.repeat(140));
    console.log(
      'Phone           | Name                 | Type      | Sub-Type        | Funnel Stage    | Resolution  | Conf | Tags'
        .padEnd(140)
    );
    console.log('-'.repeat(140));

    results.forEach((r) => {
      const phone = r.phone.substring(0, 13);
      const name = (r.name || 'N/A').substring(0, 18);
      const type = r.classification.conversation_type.substring(0, 9);
      const subType = (r.classification.sales_sub_type || r.classification.support_sub_type || 'N/A').substring(0, 14);
      const funnelStage = (r.classification.funnel_stage_reached || r.classification.resolution_signal || 'N/A').substring(0, 14);
      const resolution = (r.classification.resolution_signal || 'N/A').substring(0, 10);
      const conf = r.classification.classifier_confidence.substring(0, 4);
      const tagsStr = r.tags.slice(0, 3).join(', ');

      console.log(
        `${phone.padEnd(15)} | ${name.padEnd(20)} | ${type.padEnd(9)} | ${subType.padEnd(15)} | ${funnelStage.padEnd(15)} | ${resolution.padEnd(11)} | ${conf.padEnd(4)} | ${tagsStr}`
      );
    });

    // Detailed Classifications
    console.log('\n\n' + '='.repeat(100));
    console.log('DETAILED CLASSIFICATIONS');
    console.log('='.repeat(100) + '\n');

    results.forEach((r, idx) => {
      const c = r.classification;
      console.log(`${idx + 1}. ${r.phone} (${r.name || 'N/A'})`);
      console.log(`   Messages: ${r.messageCount} | Classified: ${new Date().toISOString().split('T')[0]}`);
      console.log(`   📊 Type: ${c.conversation_type} | Sub-type: ${c.sales_sub_type || c.support_sub_type || 'N/A'}`);
      console.log(`   🎯 Funnel: ${c.funnel_stage_reached || 'N/A'} | Resolution: ${c.resolution_signal || 'N/A'}`);
      console.log(`   ✓ Order Placed: ${c.order_placed} | Escalated: ${c.escalated_to_human}`);
      console.log(`   🔍 Confidence: ${c.classifier_confidence}`);

      if (c.objection_keywords.length > 0) {
        console.log(`   ⚠️  Objections: [${c.objection_keywords.join(', ')}]`);
      }

      if (c.classifier_notes) {
        console.log(`   📝 Notes: ${c.classifier_notes}`);
      }

      console.log(`   🏷️  Tags: [${r.tags.join(', ')}]`);
      console.log('-'.repeat(100));
    });

    // Statistics
    console.log('\n' + '='.repeat(100));
    console.log('CLASSIFICATION STATISTICS');
    console.log('='.repeat(100) + '\n');

    const stats = {
      totalUsers: results.length,
      sales: results.filter((r) => r.classification.conversation_type === 'sales').length,
      support: results.filter((r) => r.classification.conversation_type === 'support').length,
      mixed: results.filter((r) => r.classification.conversation_type === 'mixed').length,
      unclassified: results.filter((r) => r.classification.conversation_type === 'unclassified').length,
      orderPlaced: results.filter((r) => r.classification.order_placed).length,
      escalated: results.filter((r) => r.classification.escalated_to_human).length,
      highConfidence: results.filter((r) => r.classification.classifier_confidence === 'high').length,
      mediumConfidence: results.filter((r) => r.classification.classifier_confidence === 'medium').length,
      lowConfidence: results.filter((r) => r.classification.classifier_confidence === 'low').length,
    };

    console.log(`Total Users Analyzed: ${stats.totalUsers}\n`);
    console.log('Conversation Types:');
    console.log(`  📊 Sales: ${stats.sales} (${((stats.sales / stats.totalUsers) * 100).toFixed(1)}%)`);
    console.log(`  🛠️  Support: ${stats.support} (${((stats.support / stats.totalUsers) * 100).toFixed(1)}%)`);
    console.log(`  🔀 Mixed: ${stats.mixed} (${((stats.mixed / stats.totalUsers) * 100).toFixed(1)}%)`);
    console.log(`  ❓ Unclassified: ${stats.unclassified} (${((stats.unclassified / stats.totalUsers) * 100).toFixed(1)}%)\n`);

    console.log('Outcomes:');
    console.log(`  ✅ Order Placed: ${stats.orderPlaced} (${((stats.orderPlaced / stats.totalUsers) * 100).toFixed(1)}%)`);
    console.log(`  🤝 Escalated to Human: ${stats.escalated} (${((stats.escalated / stats.totalUsers) * 100).toFixed(1)}%)\n`);

    console.log('Classifier Confidence:');
    console.log(`  🟢 High: ${stats.highConfidence} (${((stats.highConfidence / stats.totalUsers) * 100).toFixed(1)}%)`);
    console.log(`  🟡 Medium: ${stats.mediumConfidence} (${((stats.mediumConfidence / stats.totalUsers) * 100).toFixed(1)}%)`);
    console.log(`  🔴 Low: ${stats.lowConfidence} (${((stats.lowConfidence / stats.totalUsers) * 100).toFixed(1)}%)`);

    console.log('\n✅ Classification and tagging completed!');

    await client.close();
  } catch (error) {
    console.error('Error:', error);
  }
}

processUsersWithOpenAI();

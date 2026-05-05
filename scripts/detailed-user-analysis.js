const { MongoClient } = require('mongodb');

const uri = 'mongodb://localhost:27017';
const dbName = 'emma-sleep';

async function analyzeUsersAcrossMatrices() {
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
      .project({ userId: 1, botUserId: 1, name: 1, tags: 1, channelName: 1 })
      .toArray();

    console.log(`\n${'='.repeat(120)}`);
    console.log('DETAILED USER ANALYSIS ACROSS 10 MATRICES');
    console.log(`${'='.repeat(120)}\n`);

    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      console.log(`\n${'#'.repeat(120)}`);
      console.log(`USER ${i + 1}/10: ${user.botUserId || 'N/A'} | ${user.name || 'N/A'}`);
      console.log(`User ID: ${user.userId}`);
      console.log(`Tags: ${(user.tags || []).join(', ')}`);
      console.log(`Channel: ${user.channelName || 'N/A'}`);
      console.log(`${'#'.repeat(120)}\n`);

      // Get all messages for this user
      const messages = await messagesCollection
        .find({ userId: user.userId })
        .sort({ sentAt: 1 })
        .toArray();

      const userMessages = messages.filter((m) => m.from === 'user');
      const botMessages = messages.filter((m) => m.from === 'bot');

      console.log(`📊 BASIC INFO:`);
      console.log(`   Total Messages: ${messages.length}`);
      console.log(`   User Messages: ${userMessages.length}`);
      console.log(`   Bot Messages: ${botMessages.length}`);
      console.log(`   Duration: ${messages.length > 0 ? Math.round((new Date(messages[messages.length - 1].sentAt) - new Date(messages[0].sentAt)) / 60000) + ' minutes' : 'N/A'}`);
      console.log();

      // 1. FUNNEL DROP-OFF
      console.log(`1️⃣  FUNNEL DROP-OFF ANALYSIS:`);
      const conversationText = messages
        .map((m) => (m.textMessage || m.type || '').toLowerCase())
        .join(' ');

      let dropPoint = 'Unknown';
      if (messages.length === 1) {
        dropPoint = 'After First Bot Message';
      } else if (
        conversationText.includes('price') ||
        conversationText.includes('cost') ||
        conversationText.includes('rs')
      ) {
        dropPoint = 'At Price Point';
      } else if (
        conversationText.includes('address') ||
        conversationText.includes('location') ||
        conversationText.includes('delivery')
      ) {
        dropPoint = 'At Address/Delivery Request';
      } else if (
        conversationText.includes('payment') ||
        conversationText.includes('pay') ||
        conversationText.includes('card')
      ) {
        dropPoint = 'At Payment Step';
      } else if (conversationText.includes('product') || conversationText.includes('mattress')) {
        dropPoint = 'At Product Selection';
      } else {
        dropPoint = 'Completed Full Funnel';
      }
      console.log(`   Drop Point: ${dropPoint}`);
      console.log(`   Message Count: ${messages.length}`);
      const isConverted = user.tags?.includes('conversion-completed');
      console.log(`   Status: ${isConverted ? '✅ CONVERTED' : '❌ DROPPED'}`);
      console.log();

      // 2. CONVERSION BY ENTRY POINT
      console.log(`2️⃣  CONVERSION BY ENTRY POINT:`);
      console.log(`   Channel: ${user.channelName || 'Direct'}`);
      console.log(`   Converted: ${isConverted ? 'YES' : 'NO'}`);
      console.log();

      // 3. TIME-TO-DECISION
      console.log(`3️⃣  TIME-TO-DECISION ANALYSIS:`);
      if (messages.length > 0) {
        const firstTime = new Date(messages[0].sentAt);
        const lastTime = new Date(messages[messages.length - 1].sentAt);
        const durationMinutes = Math.round((lastTime - firstTime) / 60000);
        const durationHours = (durationMinutes / 60).toFixed(1);
        console.log(`   Conversation Duration: ${durationMinutes} minutes (${durationHours} hours)`);
        console.log(`   Total Exchanges: ${messages.length}`);
        console.log(`   Messages Per Hour: ${(messages.length / (durationMinutes / 60)).toFixed(1)}`);
      }
      console.log();

      // 4. BOT RESPONSE QUALITY
      console.log(`4️⃣  BOT RESPONSE QUALITY:`);
      let confusionCount = 0;
      let repeatedQuestions = 0;
      const confusionKeywords = [
        'what',
        "don't understand",
        'huh',
        'confused',
        'repeat',
        'again',
        'unclear',
      ];

      for (let j = 0; j < userMessages.length; j++) {
        const text = (userMessages[j].textMessage || '').toLowerCase();
        if (confusionKeywords.some((kw) => text.includes(kw))) {
          confusionCount++;
        }
        if (j > 0) {
          const prevText = (userMessages[j - 1].textMessage || '').toLowerCase();
          if (similarity(text, prevText) > 0.7 && text.length > 0) {
            repeatedQuestions++;
          }
        }
      }
      console.log(`   Confusion Indicators: ${confusionCount}`);
      console.log(`   Repeated Questions: ${repeatedQuestions}`);
      console.log(`   Quality Score: ${confusionCount === 0 && repeatedQuestions === 0 ? 'GOOD ✅' : confusionCount <= 2 ? 'OK' : 'POOR ❌'}`);
      console.log();

      // 5. OBJECTION ANALYSIS
      console.log(`5️⃣  OBJECTION ANALYSIS:`);
      let priceObjection = 0;
      let deliveryObjection = 0;
      let trustObjection = 0;
      let productObjection = 0;
      let paymentObjection = 0;

      for (const msg of userMessages) {
        const text = (msg.textMessage || '').toLowerCase();
        if (/price|expensive|cost|rs|afford/.test(text)) priceObjection++;
        if (/delivery|shipping|how long|days|date/.test(text)) deliveryObjection++;
        if (/trust|real|fake|legit|scam/.test(text)) trustObjection++;
        if (/confused|understand|specification|features|detail/.test(text)) productObjection++;
        if (/payment|card|upi|gpay|wallet/.test(text)) paymentObjection++;
      }

      console.log(`   Price Objection: ${priceObjection > 0 ? `YES (${priceObjection} mentions)` : 'No'}`);
      console.log(`   Delivery Objection: ${deliveryObjection > 0 ? `YES (${deliveryObjection} mentions)` : 'No'}`);
      console.log(`   Trust Objection: ${trustObjection > 0 ? `YES (${trustObjection} mentions)` : 'No'}`);
      console.log(`   Product Objection: ${productObjection > 0 ? `YES (${productObjection} mentions)` : 'No'}`);
      console.log(`   Payment Objection: ${paymentObjection > 0 ? `YES (${paymentObjection} mentions)` : 'No'}`);
      const totalObjections = priceObjection + deliveryObjection + trustObjection + productObjection + paymentObjection;
      console.log(`   Total Objections: ${totalObjections}`);
      console.log();

      // 6. SUPPORT VS BUY INTENT
      console.log(`6️⃣  SUPPORT VS BUY INTENT:`);
      const hasBuyIntent = user.tags?.includes('come-to-buy');
      const hasSupportIntent = user.tags?.includes('come-to-support');
      console.log(`   Buy Intent: ${hasBuyIntent ? 'YES ✅' : 'No'}`);
      console.log(`   Support Intent: ${hasSupportIntent ? 'YES' : 'No'}`);
      console.log(`   Intent Type: ${hasBuyIntent && hasSupportIntent ? 'Hybrid (Buy + Support)' : hasBuyIntent ? 'Buy Only' : hasSupportIntent ? 'Support Only' : 'Unknown'}`);
      console.log();

      // 7. RE-ENGAGEMENT OPPORTUNITY
      console.log(`7️⃣  RE-ENGAGEMENT OPPORTUNITY:`);
      const isDropped = user.tags?.includes('dropped');
      if (isDropped) {
        const progressPercentage = (messages.length / 100) * 100; // Rough estimate
        console.log(`   Status: DROPPED ❌`);
        console.log(`   Messages Sent: ${userMessages.length}`);
        console.log(`   Engagement Level: ${userMessages.length > 20 ? 'HIGH' : userMessages.length > 10 ? 'MEDIUM' : 'LOW'}`);
        if (userMessages.length > 15) {
          console.log(`   🔥 HOT LEAD - User engaged deeply before dropping`);
          const dropReason = user.tags
            ?.find((t) => t.startsWith('dropped-'))
            ?.replace('dropped-', '');
          console.log(`   Dropout Reason: ${dropReason || 'Unknown'}`);
        }
      } else {
        console.log(`   Status: CONVERTED ✅`);
        console.log(`   Not applicable for conversions`);
      }
      console.log();

      // 8. MESSAGE VOLUME ANALYSIS
      console.log(`8️⃣  MESSAGE VOLUME ANALYSIS:`);
      const userMessageRatio = userMessages.length > 0 ? ((userMessages.length / messages.length) * 100).toFixed(1) : 0;
      console.log(`   User Messages: ${userMessages.length}`);
      console.log(`   Bot Messages: ${botMessages.length}`);
      console.log(`   User-to-Bot Ratio: ${userMessageRatio}%`);
      console.log(`   Pattern: ${userMessageRatio > 60 ? 'User-heavy (talkative)' : userMessageRatio < 30 ? 'Bot-heavy (listening)' : 'Balanced'}`);
      console.log(`   Conversation Health: ${messages.length > 50 ? 'GOOD (Engaged)' : messages.length > 20 ? 'OK' : 'LOW (Brief)'}  `);
      console.log();

      // 9. TIME PATTERNS
      console.log(`9️⃣  TIME PATTERNS:`);
      if (messages.length > 0) {
        const firstMsg = new Date(messages[0].sentAt);
        const lastMsg = new Date(messages[messages.length - 1].sentAt);
        const hour = firstMsg.getHours();
        const dayOfWeek = firstMsg.toLocaleDateString('en-US', { weekday: 'long' });
        console.log(`   Start Time: ${firstMsg.toLocaleTimeString()}`);
        console.log(`   Hour of Day: ${hour}:00`);
        console.log(`   Day of Week: ${dayOfWeek}`);
        console.log(`   Time Spread: ${Math.round((lastMsg - firstMsg) / 3600000)} hours`);
      }
      console.log();

      // 10. LANGUAGE ANALYSIS
      console.log(`🔟 LANGUAGE & COMMUNICATION STYLE:`);
      let hindiCount = 0;
      let gujaratiCount = 0;
      let englishCount = 0;

      for (const msg of userMessages) {
        const text = msg.textMessage || '';
        const hindiMatches = (text.match(/[ऀ-ॿ]/g) || []).length;
        const gujaratiMatches = (text.match(/[઀-૿]/g) || []).length;

        if (hindiMatches > gujaratiMatches && hindiMatches > 0) hindiCount++;
        else if (gujaratiMatches > hindiMatches && gujaratiMatches > 0) gujaratiCount++;
        else englishCount++;
      }

      const totalLanguageMessages = hindiCount + gujaratiCount + englishCount;
      if (totalLanguageMessages > 0) {
        console.log(`   Hindi: ${((hindiCount / totalLanguageMessages) * 100).toFixed(1)}%`);
        console.log(`   Gujarati: ${((gujaratiCount / totalLanguageMessages) * 100).toFixed(1)}%`);
        console.log(`   English: ${((englishCount / totalLanguageMessages) * 100).toFixed(1)}%`);
        const primaryLang =
          hindiCount > gujaratiCount && hindiCount > englishCount
            ? 'Hindi'
            : gujaratiCount > englishCount
              ? 'Gujarati'
              : 'English';
        console.log(`   Primary Language: ${primaryLang}`);
      }
      console.log();

      // SUMMARY & RECOMMENDATIONS
      console.log(`📋 SUMMARY & RECOMMENDATIONS:`);
      const recommendations = [];

      if (priceObjection > 0) recommendations.push('💰 Address price objection with discount/EMI');
      if (productObjection > 0) recommendations.push('📦 Improve product descriptions & clarity');
      if (deliveryObjection > 0) recommendations.push('🚚 Show delivery tracking & timeline');
      if (confusionCount > 2) recommendations.push('🤖 Bot needs training - users confused');
      if (isDropped && userMessages.length > 15)
        recommendations.push('🔥 HOT LEAD - Send re-engagement offer immediately');
      if (hasSupportIntent && !isConverted)
        recommendations.push('💡 Support user - try to upsell relevant products');
      if (messages.length < 5)
        recommendations.push('⚡ Very brief engagement - improve opening message');

      if (recommendations.length === 0) {
        console.log(`   ✅ No major issues detected`);
      } else {
        recommendations.forEach((rec) => console.log(`   ${rec}`));
      }
      console.log();
    }

    console.log(`\n${'='.repeat(120)}`);
    console.log('ANALYSIS COMPLETE');
    console.log(`${'='.repeat(120)}\n`);

    await client.close();
  } catch (error) {
    console.error('Error:', error);
  }
}

// Helper functions
function similarity(str1, str2) {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) return 1.0;

  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

function levenshteinDistance(str1, str2) {
  const costs = [];
  for (let k = 0; k <= str1.length; k++) {
    let lastValue = k;
    for (let k2 = 0; k2 <= str2.length; k2++) {
      let newValue = k2;
      if (str1.charAt(k - 1) === str2.charAt(k2 - 1)) {
        newValue = lastValue;
      } else {
        newValue = Math.min(Math.min(newValue + 1, lastValue + 1), (costs[k2] || 0) + 1);
      }
      costs[k2] = lastValue;
      lastValue = newValue;
    }
    costs[str1.length] = lastValue;
  }
  return costs[str2.length] || 0;
}

analyzeUsersAcrossMatrices();

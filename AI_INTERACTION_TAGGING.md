# AI Interaction Tagging Guide

## Overview

Users with messages from `aiAgent` or `Bot` should be tagged with `ai-used`. This document explains how to identify and tag these users.

## Understanding the Data

In the messages collection, messages have a `from` field with three possible values:

| Value | Meaning |
|-------|---------|
| `user` or `User` | User-sent message |
| `aiAgent` | AI agent response |
| `Bot` | Bot response |

Users with any messages from `aiAgent` or `Bot` should have the `ai-used` tag.

## Two Approaches

### Approach 1: Bulk Tag Users (Recommended First)

Use this to tag all users who have AI interactions in one go.

```bash
node scripts/tag-users-with-ai-interaction.js
```

**What it does:**
1. Finds all distinct `userId` values with `from: "aiAgent"` or `from: "Bot"`
2. For each user, checks if they already have `ai-used` tag
3. Adds `ai-used` tag to those who don't have it
4. Reports statistics

**Output Example:**
```
Found 150 users with AI interactions

✅ New users tagged with ai-used: 142
⏭️  Already had ai-used tag: 8
❌ Errors: 0
📊 Total users processed: 150/150

✅ AI interaction tagging completed!
```

### Approach 2: Classify and Auto-Tag

The updated `analyze-with-openai.js` now automatically:
1. Finds users with AI message interactions
2. Classifies their conversations
3. Auto-generates tags (including `ai-used`)
4. Stores full classification

```bash
node scripts/analyze-with-openai.js
```

**Recommended workflow:**
1. First run: `tag-users-with-ai-interaction.js` to tag existing users
2. Then run: `analyze-with-openai.js` to classify conversations
3. View: `generate-classification-report.js` for analytics

## Database Changes

### Before
```javascript
db.customers.findOne({ userId: "123" })
// Result:
{
  userId: "123",
  name: "John",
  tags: ["come-to-buy"]  // Missing ai-used
}
```

### After
```javascript
db.customers.findOne({ userId: "123" })
// Result:
{
  userId: "123",
  name: "John",
  tags: ["come-to-buy", "ai-used"]  // ai-used added
}
```

## How It Works

### Step 1: Find Users with AI Messages

```javascript
// This query finds all userIds with aiAgent/Bot messages
db.messages.distinct('userId', { from: { $in: ['aiAgent', 'Bot'] } })
// Result: [userId1, userId2, userId3, ...]
```

### Step 2: Update Customer Tags

```javascript
// For each user, add ai-used tag if not present
db.customers.updateOne(
  { userId: "123" },
  { $set: { tags: ["come-to-buy", "ai-used"] } }
)
```

## Checking Progress

### Count users with ai-used tag
```javascript
db.customers.countDocuments({ tags: "ai-used" })
```

### Count users with AI messages
```javascript
db.messages.distinct('userId', { from: { $in: ['aiAgent', 'Bot'] } }).length
```

### Find users with AI messages but no ai-used tag
```javascript
const usersWithAIMessages = db.messages.distinct('userId', { from: { $in: ['aiAgent', 'Bot'] } });
db.customers.find({
  userId: { $in: usersWithAIMessages },
  tags: { $ne: "ai-used" }
}).count()
```

## Verification

After tagging, verify the count matches:

```bash
# Run this JavaScript
node -e "
const { MongoClient } = require('mongodb');

async function verify() {
  const client = new MongoClient('mongodb://localhost:27017');
  await client.connect();
  const db = client.db('emma-sleep');
  
  // Count messages from AI
  const usersWithAIMessages = await db.collection('messages')
    .distinct('userId', { from: { \$in: ['aiAgent', 'Bot'] } });
  
  // Count users with ai-used tag
  const usersWithAITag = await db.collection('customers')
    .countDocuments({ tags: 'ai-used' });
  
  console.log('Users with AI messages:', usersWithAIMessages.length);
  console.log('Users with ai-used tag:', usersWithAITag);
  console.log('Match:', usersWithAIMessages.length === usersWithAITag ? '✅ YES' : '❌ NO');
  
  await client.close();
}

verify();
"
```

## Related Tags

Once users are tagged with `ai-used`, the classification system will add more specific tags:

| Tag | Meaning |
|-----|---------|
| `ai-used` | User had AI interactions |
| `come-to-buy` | SALES conversation |
| `come-to-support` | SUPPORT conversation |
| `buy` | Order was placed |
| `dropped` | Abandoned without purchasing |
| `escalated-to-human` | Escalated to human |
| ... | 15+ more classification-based tags |

## Usage in Analysis

Once tagged, you can query and analyze:

```javascript
// Find all users who interacted with AI
db.customers.find({ tags: "ai-used" })

// Find sales conversations with AI
db.customers.find({ 
  tags: { $all: ["ai-used", "come-to-buy"] }
})

// Find unresolved support with AI
db.customers.find({
  tags: "ai-used",
  "classification.conversation_type": "support",
  "classification.resolution_signal": "unresolved"
})
```

## Troubleshooting

### Issue: Numbers don't match
**Users with AI messages** vs **Users with ai-used tag** might differ if:
- Customers collection is incomplete (some userIds don't exist in customers)
- Tags were manually removed
- Database sync issues

**Solution:**
```javascript
// Find missing users
const usersWithAIMessages = db.messages.distinct('userId', { from: { $in: ['aiAgent', 'Bot'] } });
const missingUsers = usersWithAIMessages.filter(async (userId) => {
  return await db.customers.countDocuments({ userId }) === 0;
});
console.log('Users with AI messages but no customer record:', missingUsers.length);
```

### Issue: Tagging script hangs
- Check MongoDB is running: `mongosh`
- Check network connectivity
- Reduce batch size if memory issues

## Batch Processing

For large-scale tagging with custom batch sizes:

```javascript
// Modify tag-users-with-ai-interaction.js line 48 to batch process
// Example: Process 1000 at a time
const batchSize = 1000;
for (let i = 0; i < usersWithAIMessages.length; i += batchSize) {
  const batch = usersWithAIMessages.slice(i, i + batchSize);
  // Process batch...
}
```

## Next Steps

1. ✅ Run `tag-users-with-ai-interaction.js` to tag all AI users
2. ✅ Verify counts match using the verification script
3. ✅ Run `analyze-with-openai.js` to classify conversations
4. ✅ Run `generate-classification-report.js` to view analytics
5. ✅ Use classification tags for further analysis and actions

## Files Reference

| File | Purpose |
|------|---------|
| `tag-users-with-ai-interaction.js` | Bulk tag users with ai-used |
| `analyze-with-openai.js` | Classify conversations (now finds AI users automatically) |
| `generate-classification-report.js` | Generate analytics report |

---

**Last Updated:** May 11, 2026
**Status:** ✅ Ready to use

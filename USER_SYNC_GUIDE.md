# 👥 User Sync Guide

Complete guide for syncing users, customer fields, and messages from Netcore API to MongoDB.

---

## 📋 Overview

The user sync system provides multiple approaches to import customer data:

### What Gets Synced
1. **Users** - Basic customer info (name, phone, email)
2. **Custom Fields** - User-defined fields (via `customFields` or `custom_fields`)
3. **Tags** - User tags and labels (see [Tag System](#tag-system))
4. **Messages** - All conversations (transcripts)

### Sync Approaches

| Method | Source | Use Case | Progress Updates |
|--------|--------|----------|------------------|
| **API Direct** | Netcore API | Production data | Every 100 users ✓ |
| **File Import** | JSON file | Testing/backup | Every 100 users ✓ |
| **Fallback** | API with retry | Resilient sync | Every 100 users ✓ |

---

## 🚀 Quick Start

### Prerequisites
```bash
# Verify MongoDB is running
mongosh emma-sleep --eval "db.customers.countDocuments()"

# Install dependencies
npm install
```

### 1. Configure API Credentials

Update `.env` file:
```bash
NETCORE_API_BASE_URL=https://open-api.conversationalcommerce.netcorecloud.com
NETCORE_APP_ID=your_app_id
NETCORE_APP_SECRET=your_app_secret
MONGODB_URI=mongodb://localhost:27017/emma-sleep
```

### 2. Run Sync Script

```bash
# Option 1: Sync from API (recommended for production)
node scripts/sync-users-api.js

# Option 2: Sync from JSON file (for testing)
node scripts/sync-users-from-file.js

# Option 3: Fallback with retry logic
node scripts/sync-users-v2.js
```

### 3. Monitor Progress

The sync will show progress every 100 users:
```
✅ 100 users inserted (100/500 processed)
✅ 200 users inserted (200/500 processed)
✅ 300 users inserted (300/500 processed)
...
✅ 1500 messages synced (50/500 users processed)
```

---

## 📊 Configuration

### Sync Limit (How Many Users)

Edit the script file and change:
```javascript
const SYNC_LIMIT = 500;  // Change to desired number
```

Options:
- `100` - Quick test
- `500` - Medium batch
- `5000` - Large batch
- `0` or `null` - Sync all available users

### Batch Size (Progress Update Frequency)

```javascript
const BATCH_SIZE = 100;  // Shows progress every 100 users
```

Change to:
- `50` - More frequent updates
- `100` - Default
- `500` - Less frequent updates

### Clear Existing Data

The scripts will **always ask** before clearing:
```javascript
// Edit in sync script to customize:
await clearExistingData(db);  // Removes all customers and messages
```

---

## 🔄 Sync Flow

```
┌─────────────────────────────────────────┐
│   1. Fetch User List (POST /v1/users)  │
│      Returns: [user1, user2, ...]      │
└──────────────┬──────────────────────────┘
               ↓
┌─────────────────────────────────────────┐
│  2. Clear Existing Data (DELETE all)    │
│     Removes: Old users + messages       │
└──────────────┬──────────────────────────┘
               ↓
┌─────────────────────────────────────────┐
│ 3. Fetch User Details (GET /userData)   │
│    For each user: custom fields, tags   │
│    Batch insert every 100 users ✓       │
└──────────────┬──────────────────────────┘
               ↓
┌─────────────────────────────────────────┐
│ 4. Fetch Messages (POST /transcripts)   │
│    For each user: conversation history  │
│    Batch insert messages ✓              │
└──────────────┬──────────────────────────┘
               ↓
┌─────────────────────────────────────────┐
│     5. Generate Sync Report             │
│        Summary + Errors + Stats         │
└─────────────────────────────────────────┘
```

---

## 📝 API Endpoints Used

According to Netcore OpenAPI docs:

### 1. Fetch Users List
```
POST /v1/users
Headers:
  x-app-id: {APP_ID}
  x-app-secret: {APP_SECRET}

Body:
{
  "limit": 500,
  "offset": 0,
  "sortBy": "createdAt",
  "sortOrder": "desc"
}

Response:
{
  "data": [
    {
      "id": "user123",
      "name": "John Doe",
      "phoneNumber": "+918942838999",
      "email": "john@example.com",
      "customFields": {...},
      "tags": ["ai-used", "come-to-buy"],
      ...
    }
  ]
}
```

### 2. Get User Details
```
GET /v1/userData/{userId}
Headers: [same as above]

Response:
{
  "data": {
    "id": "user123",
    "customFields": {...},
    "tags": [...],
    "lastInteractedDate": "2026-05-05T10:30:00Z",
    ...
  }
}
```

### 3. Get User Messages (Transcripts)
```
POST /v1/transcripts
Headers: [same as above]

Body:
{
  "filters": {
    "userId": "user123"
  },
  "limit": 1000,
  "offset": 0
}

Response:
{
  "data": [
    {
      "id": "msg123",
      "from": "user",
      "text": "Hi, do you have this in stock?",
      "sentAt": "2026-05-05T10:30:00Z",
      ...
    }
  ]
}
```

---

## 🏷️ Tag System

Tags are automatically assigned based on user behavior analysis:

### Standard Tags
```
ai-used              → User has interacted with AI agent
come-to-buy          → User shows purchase intent
come-to-support      → User seeks support/help
conversion-completed → User has completed purchase
buy                  → User made a purchase
dropped              → User abandoned conversation
dropped-at-{stage}   → Specific dropout stage:
                        - product-selection
                        - price-point
                        - delivery-request
                        - payment-step
                        - support
```

### Custom Tags
Add custom tags via the API or directly in MongoDB:
```javascript
db.customers.updateOne(
  { userId: "user123" },
  { $push: { tags: "vip-customer" } }
)
```

---

## 📊 Synced Data Structure

### Customers Collection
```javascript
{
  _id: ObjectId,
  userId: "user123",                    // External user ID
  botUserId: "+918942838999",           // Phone or bot user ID
  name: "John Doe",
  email: "john@example.com",
  phoneNumber: "+918942838999",
  customFields: {
    accountType: "premium",
    preferences: {...}
  },
  tags: ["ai-used", "come-to-buy", "conversion-completed"],
  channelName: "whatsapp",              // Channel source
  lastInteractedDate: ISODate,
  createdAt: ISODate
}
```

### Messages Collection
```javascript
{
  _id: ObjectId,
  userId: "user123",
  from: "user" | "bot",
  textMessage: "Hi, do you have mattress in XL?",
  type: "text",
  sentAt: ISODate,
  metadata: {}
}
```

---

## ⚠️ Troubleshooting

### Problem: 404 Errors on API Calls
**Solution:** Verify API credentials and base URL in `.env`
```bash
echo $NETCORE_API_BASE_URL
echo $NETCORE_APP_ID
echo $NETCORE_APP_SECRET
```

### Problem: MongoDB Connection Failed
**Solution:** Ensure MongoDB is running
```bash
# Check MongoDB status
mongosh --eval "db.adminCommand('ping')"

# Start MongoDB if needed
mongod --dbpath /data/db &
```

### Problem: Out of Memory During Large Sync
**Solution:** Reduce `SYNC_LIMIT` or increase Node.js heap
```bash
node --max-old-space-size=4096 scripts/sync-users-api.js
```

### Problem: Duplicate Users in Database
**Solution:** The script clears all data before syncing (existing data is removed)
```bash
# Verify data was cleared
db.customers.countDocuments()  # Should be 0 before sync
```

---

## 📈 Performance

### Expected Sync Times
| Users | Time | Speed |
|-------|------|-------|
| 100 | ~30 sec | 3.3 users/sec |
| 500 | ~2 min | 4.2 users/sec |
| 1,000 | ~4 min | 4.1 users/sec |
| 5,000 | ~18 min | 4.6 users/sec |

### Optimization Tips
1. **Increase batch size** for large syncs (BATCH_SIZE = 500)
2. **Run during off-hours** to avoid API rate limits
3. **Use dedicated MongoDB instance** for faster inserts
4. **Monitor API rate limits** - May need to implement delays

---

## 🔒 Security Notes

- **API Keys**: Keep `.env` file secure (not in version control)
- **Data Privacy**: Ensure compliance with data protection regulations
- **Audit Trail**: Consider logging all sync operations
- **Access Control**: Restrict database access to authorized users

---

## 📋 Sync Report Example

```
================================================================================
📊 SYNC REPORT
================================================================================

📈 Summary:
   ✅ Users from API: 500
   ✅ Users inserted: 500
   ✅ Messages inserted: 12,847
   ✅ Existing users removed: 305

⚠️  Errors: 0
✅ No errors!

================================================================================
```

---

## 🔗 Related Commands

```bash
# Check sync status
db.customers.countDocuments()
db.messages.countDocuments()

# View recent users
db.customers.find().sort({ createdAt: -1 }).limit(10)

# Count by intent
db.customers.countDocuments({ tags: "come-to-buy" })
db.customers.countDocuments({ tags: "conversion-completed" })

# Find messages by user
db.messages.find({ userId: "user123" }).sort({ sentAt: -1 })

# View sync stats
db.customers.aggregate([
  { $group: { _id: null, count: { $sum: 1 }, avgMessages: { $avg: { $size: "$messages" } } } }
])
```

---

## 📚 Advanced Usage

### Custom Sync Logic

Edit `sync-users-api.js` to customize:

**Skip certain users:**
```javascript
if (user.name === 'Test User') continue;
```

**Transform custom fields:**
```javascript
const userData = {
  ...existing,
  customFields: {
    ...existing.customFields,
    customKey: transformValue(user.custom)
  }
};
```

**Filter messages:**
```javascript
const messages = await fetchMessages(userId);
const filtered = messages.filter(m => m.from === 'user');
```

### Incremental Sync

Modify to sync only new users:
```javascript
const existingIds = new Set(
  (await customersCollection.find({}, { userId: 1 }).toArray())
    .map(u => u.userId)
);

const newUsers = users.filter(u => !existingIds.has(u.id));
```

---

## 📞 Support

For issues:
1. Check the Troubleshooting section above
2. Review sync report for detailed errors
3. Verify API credentials and MongoDB connection
4. Check logs: `tail -f /tmp/sync.log`

---

**Last Updated**: May 6, 2026  
**Version**: 2.0  
**Status**: Production Ready

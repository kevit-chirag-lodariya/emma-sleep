# Quick Start: Emma Sleep Intent Classification

## 5-Minute Setup

### 1. Create Database Indexes
```bash
cd /home/chirag/Desktop/Chatomate/emma-sleep
node scripts/setup-classification-indexes.js
```

Expected output:
```
✅ Index created: classification.conversation_type
✅ Index created: classification.sales_sub_type
... (8 more indexes)
✅ All indexes created successfully!
```

### 2. Classify First 10 Users
```bash
node scripts/analyze-with-openai.js
```

Expected output:
```
Processing 10 users with OpenAI (GPT-4o mini)...

[1/10] Analyzing user: user_12345
Phone: +919876543210 | Name: John Doe
Messages: 23
Analyzing with OpenAI...

✅ Classification: sales
📊 Type: sales | Sub-type: new_inquiry
🎯 Funnel Stage: price_shared | Resolution: N/A
📋 Order Placed: false | Escalated: false
🔍 Confidence: high
✏️  Tags: [ai-used, come-to-buy, dropped-at-product-selection]
```

### 3. Generate Report
```bash
node scripts/generate-classification-report.js
```

Expected output:
```
Total Classified Users: 10

📊 CONVERSATION TYPE DISTRIBUTION
  sales            | ███░░░░░░░░░░░░░░░░░░░░░░ | 6 (60.0%)
  support          | ██░░░░░░░░░░░░░░░░░░░░░░░ | 3 (30.0%)
  mixed            | █░░░░░░░░░░░░░░░░░░░░░░░░ | 1 (10.0%)

📈 SALES SUB-TYPE DISTRIBUTION
  new_inquiry      | 4 (66.7%)
  abandoned        | 2 (33.3%)

✅ ORDER PLACED: 2 (20.0%)
🤝 ESCALATED TO HUMAN: 1 (10.0%)

🔍 CLASSIFIER CONFIDENCE DISTRIBUTION
  🟢 high         | 8 (80.0%)
  🟡 medium       | 2 (20.0%)
  🔴 low          | 0 (0.0%)
```

### 4. Backup Data
```bash
node scripts/backup-classification-data.js
```

Expected output:
```
✅ Backup saved: /path/to/backups/classification_backup_2026-05-11.json
📊 Total classified users backed up: 10
📋 Metadata saved: /path/to/backups/classification_metadata_2026-05-11.json
```

## What Gets Stored

Each classified user now has:

```javascript
{
  userId: "123...",
  name: "John Doe",
  botUserId: "+919876543210",
  
  // NEW: Full classification data
  classification: {
    conversation_type: "sales",
    sales_sub_type: "new_inquiry",
    support_sub_type: null,
    funnel_stage_reached: "price_shared",
    resolution_signal: null,
    order_placed: false,
    escalated_to_human: false,
    objection_keywords: ["thoda mehnga hai"],
    classifier_confidence: "high",
    classifier_notes: ""
  },
  
  // NEW: Auto-generated tags
  tags: ["ai-used", "come-to-buy", "dropped-at-product-selection"],
  
  // NEW: When classified
  classifiedAt: "2026-05-11T10:30:00Z"
}
```

## Query Examples

### Find sales conversations
```bash
db.customers.find({ "classification.conversation_type": "sales" })
```

### Find orders placed
```bash
db.customers.find({ "classification.order_placed": true })
```

### Find high-confidence classifications
```bash
db.customers.find({ "classification.classifier_confidence": "high" })
```

### Find unresolved support issues
```bash
db.customers.find({
  "classification.conversation_type": "support",
  "classification.resolution_signal": "unresolved"
})
```

### Find abandoned sales
```bash
db.customers.find({
  "classification.sales_sub_type": "abandoned",
  "classification.funnel_stage_reached": { $in: ["checkout_intent", "price_shared"] }
})
```

## Scaling Up

To classify more users, edit `scripts/analyze-with-openai.js` line 124:

```javascript
.limit(10)  // Change to desired number (50, 100, 500, etc.)
```

Then run:
```bash
node scripts/analyze-with-openai.js
```

**Cost estimate:**
- 10 users = $0.03-0.05
- 100 users = $0.30-0.50
- 1,000 users = $3.00-5.00

## Understanding Classification Confidence

### 🟢 HIGH (80%+ expected)
- Intent is crystal clear
- Conversation has clear context
- No ambiguity in classification
- ✅ Use directly in analysis

### 🟡 MEDIUM (15%+ expected)
- One or two judgment calls made
- Short conversation or unusual language
- Plausible alternative classification exists
- ⚠️ Human review recommended

### 🔴 LOW (5%+ expected)
- Intent is genuinely unclear
- Very few messages or unclear signals
- Classification is a best guess
- 🔴 Mandatory human re-review

## Common Classification Patterns

### ✅ SALES + new_inquiry → Likely abandoned
User asking about product but never ordered → `dropped` tag

### ✅ SALES → price_shared stage
User learned the price and went silent → `dropped-at-product-selection`

### ✅ SUPPORT + delivery sub-type
User asking "where is my order" → `delivery-issue` tag

### ✅ SUPPORT + unresolved signal
User's last message shows frustration, no closure → human follow-up needed

### ✅ MIXED conversation
Both sales and support threads substantial → requires human context

## Troubleshooting

**Q: No classifications being saved?**
- Check MongoDB is running: `mongosh`
- Verify OPENAI_API_KEY in .env
- Check logs for OpenAI API errors

**Q: Getting low confidence warnings?**
- Normal for conversations under 5 messages
- Review classifier_notes for reasoning
- Consider whether conversation is actually classifiable

**Q: Want to retry failed users?**
- Remove `classification` field from database
- Run classification script again

## Next: Advanced Features

Once comfortable with basic classification:

1. **Batch Processing** - Classify 500+ users
2. **Human Review Workflow** - Set up verification process
3. **Analytics Dashboard** - Build visualizations
4. **Automated Actions** - Trigger workflows based on classification
5. **Model Tuning** - Refine prompts for specific scenarios

## Files Reference

| Script | Purpose |
|--------|---------|
| `analyze-with-openai.js` | Main classifier - reads rulebook and classifies |
| `setup-classification-indexes.js` | Creates MongoDB indexes |
| `generate-classification-report.js` | Analytics and distribution report |
| `backup-classification-data.js` | Backs up all classified data |

## Documentation

- **Full Guide**: `CLASSIFICATION_SETUP.md`
- **Rulebook**: `Emma_Sleep_Intent_Classification_Rulebook_v2.docx`
- **Classification Schema**: See classifier output format in analyze-with-openai.js

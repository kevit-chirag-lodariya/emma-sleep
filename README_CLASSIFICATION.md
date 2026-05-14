# Emma Sleep Intent Classification System

## 📋 What's New

Successfully implemented the **Emma Sleep Intent Classification Rulebook v2** into the conversation analysis system. The system now intelligently classifies all customer conversations using a 10-field schema based on OpenAI GPT-4o analysis.

## 🚀 Quick Start (5 Minutes)

```bash
cd /home/chirag/Desktop/Chatomate/emma-sleep

# 1. Create database indexes
node scripts/setup-classification-indexes.js

# 2. Classify first 10 users
node scripts/analyze-with-openai.js

# 3. View analytics report
node scripts/generate-classification-report.js

# 4. Backup classified data
node scripts/backup-classification-data.js
```

## 📁 Files Overview

### Core Scripts (in `/scripts/`)

| File | Purpose | Size |
|------|---------|------|
| [analyze-with-openai.js](scripts/analyze-with-openai.js) | Main classifier (16KB) | ✅ Modified |
| [setup-classification-indexes.js](scripts/setup-classification-indexes.js) | Create MongoDB indexes (3.5KB) | ✨ New |
| [generate-classification-report.js](scripts/generate-classification-report.js) | Analytics dashboard (8.3KB) | ✨ New |
| [backup-classification-data.js](scripts/backup-classification-data.js) | Data backup utility (3.5KB) | ✨ New |

### Documentation

| File | Audience | Purpose |
|------|----------|---------|
| [QUICKSTART_CLASSIFICATION.md](QUICKSTART_CLASSIFICATION.md) | 👤 Everyone | 5-minute setup guide |
| [CLASSIFICATION_SETUP.md](CLASSIFICATION_SETUP.md) | 👨‍💼 Developers | Complete reference guide |
| [CLASSIFICATION_REFERENCE.md](CLASSIFICATION_REFERENCE.md) | 👁️ Analysts | Printable quick reference |
| [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md) | 📊 Stakeholders | Project overview |
| [CHANGELIST.md](CHANGELIST.md) | 🔧 Tech | What changed |

## 🎯 The 10-Field Classification

Every conversation is analyzed and stored with 10 fields:

```json
{
  "conversation_type": "sales | support | mixed | unclassified",
  "sales_sub_type": "new_inquiry | repeat_buyer | abandoned",
  "support_sub_type": "delivery | return_refund | product_quality | warranty | payment_order | general",
  "funnel_stage_reached": "greeting | need_discovery | product_shown | price_shared | checkout_intent | ordered",
  "resolution_signal": "resolved | unresolved | escalated | unknown",
  "order_placed": true,
  "escalated_to_human": false,
  "objection_keywords": ["exact", "phrases", "from", "user"],
  "classifier_confidence": "high",
  "classifier_notes": ""
}
```

## 💡 Key Features

✅ **Intent-Based** - Understands what customers mean, not just keywords
✅ **Multilingual** - Understands English, Hindi, Hinglish, Gujarati
✅ **Context-Aware** - Reads full conversation (both user and bot messages)
✅ **Confidence Levels** - Marks uncertainty for human review
✅ **Auto Tags** - Generates 20+ tags automatically
✅ **Analytics** - Comprehensive reporting and statistics
✅ **Scalable** - Process hundreds of conversations
✅ **Backed Up** - Timestamped backups with metadata

## 🔍 Classification Examples

### Example 1: Sales → Abandoned
```
User: "Emma Original kaisa hai? Price kitna hai?"
Bot: "Emma Original ₹9,599 hai..."
User: (no response)

Classification:
- Type: SALES / new_inquiry → abandoned
- Funnel: price_shared (user learned price, went silent)
- Tags: ai-used, come-to-buy, dropped-at-product-selection
```

### Example 2: Support → Delivery Issue → Escalated
```
User: "Mera order nahi aaya abhi tak"
Bot: "Kab order kiya tha?"
User: "3 din pehle"
Bot: "Hamare team ko connect kar raha hoon..."

Classification:
- Type: SUPPORT / delivery
- Resolution: escalated
- Tags: ai-used, come-to-support, escalated-to-human, delivery-issue
```

### Example 3: Mixed (Sales + Support)
```
User: "Ek aur mattress lena hai guest room ke liye"
Bot: "Bilkul! Naya order ke liye..."
User: "Haan, par pehle wale mein ek corner se foam aa raha hai"
Bot: "Iska resolution process..."

Classification:
- Type: MIXED (both threads substantial)
- Tags: ai-used, come-to-buy, come-to-support, quality-complaint
```

## 📊 Database Changes

Each customer document now includes:

```javascript
{
  // ... existing fields unchanged ...
  
  // NEW: Full classification (10 fields)
  classification: { /* ... */ },
  
  // UPDATED: Auto-generated tags
  tags: ["ai-used", "come-to-buy", "dropped-at-product-selection"],
  
  // NEW: When classified
  classifiedAt: ISODate("2026-05-11T10:30:00Z")
}
```

## 📈 What Gets Measured

### Conversation Types
- **Sales** - Evaluating or trying to purchase
- **Support** - Help with existing order/product
- **Mixed** - Both sales AND support
- **Unclassified** - Can't determine intent

### Sales Funnels
```
greeting → need_discovery → product_shown → price_shared → checkout_intent → ordered
```

### Support Resolution
- ✅ **Resolved** - Issue addressed, user satisfied
- ❌ **Unresolved** - Left frustrated
- 🤝 **Escalated** - Handed to human
- ❓ **Unknown** - Unclear from conversation

## 🎓 Understanding Confidence Levels

| Level | Meaning | Action |
|-------|---------|--------|
| 🟢 **HIGH** (80%+) | Crystal clear intent | ✅ Use directly |
| 🟡 **MEDIUM** (15%+) | Judgment call made | ⚠️ Review recommended |
| 🔴 **LOW** (5%+) | Genuinely unclear | 🔴 Mandatory review |

## 🔎 Query Examples

```javascript
// Find all sales conversations
db.customers.find({ "classification.conversation_type": "sales" })

// Find orders placed
db.customers.find({ "classification.order_placed": true })

// Find unresolved support issues
db.customers.find({
  "classification.conversation_type": "support",
  "classification.resolution_signal": "unresolved"
})

// Find abandoned sales at checkout
db.customers.find({
  "classification.sales_sub_type": "abandoned",
  "classification.funnel_stage_reached": "checkout_intent"
})

// Find low-confidence classifications for review
db.customers.find({ "classification.classifier_confidence": "low" })

// Find by tags
db.customers.find({ tags: { $in: ["dropped-at-payment", "escalated-to-human"] } })
```

## 💰 Pricing

Using GPT-4o mini:
- **10 users** ≈ $0.03-0.05
- **100 users** ≈ $0.30-0.50
- **1,000 users** ≈ $3.00-5.00

Cost scales with batch size. No difference in speed.

## 📖 Documentation Guide

**Choose your guide based on your role:**

| Role | Read | Time |
|------|------|------|
| 🚀 Quick Setup | [QUICKSTART_CLASSIFICATION.md](QUICKSTART_CLASSIFICATION.md) | 5 min |
| 👨‍💼 Implementation | [CLASSIFICATION_SETUP.md](CLASSIFICATION_SETUP.md) | 20 min |
| 👁️ Analyst/Reviewer | [CLASSIFICATION_REFERENCE.md](CLASSIFICATION_REFERENCE.md) | 10 min |
| 📊 Stakeholder | [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md) | 10 min |
| 🔧 Technical Details | [CHANGELIST.md](CHANGELIST.md) | 15 min |

## ⚙️ Setup Workflow

### Step 1: Prepare Database
```bash
node scripts/setup-classification-indexes.js
```
✅ Creates 11 MongoDB indexes for fast querying

### Step 2: Classify Users
```bash
# Edit .limit(10) in script for different batch sizes
node scripts/analyze-with-openai.js
```
✅ Classifies conversations and stores 10-field data

### Step 3: Review Results
```bash
node scripts/generate-classification-report.js
```
✅ Shows distribution, confidence, top tags, and low-confidence users

### Step 4: Backup Data
```bash
node scripts/backup-classification-data.js
```
✅ Saves timestamped backup with metadata

## 🎯 Common Next Steps

1. **Scale to more users** - Edit `.limit(10)` to `.limit(100)` or more
2. **Implement human review** - Query `classifier_confidence: "medium"` or `"low"`
3. **Build dashboard** - Use classification data for analytics
4. **Automate actions** - Trigger workflows based on classification
5. **Track accuracy** - Monitor confidence levels and human reviews

## ⚠️ Important Notes

- **First run overwrites tags** - Old tag format will be replaced with new auto-generated tags
- **Backup first** - Run `backup-classification-data.js` before large-scale classification
- **Test small batch** - Try with 10-20 users first
- **Monitor costs** - Each conversation costs $0.003-0.005 in OpenAI API
- **Human review needed** - Low confidence classifications require manual verification

## 📞 Support

For issues or questions:

1. Check [CLASSIFICATION_REFERENCE.md](CLASSIFICATION_REFERENCE.md) - Troubleshooting section
2. Review [CLASSIFICATION_SETUP.md](CLASSIFICATION_SETUP.md) - Full documentation
3. Examine logs from `analyze-with-openai.js` - Debug information
4. Check MongoDB directly - Verify data is stored correctly

## 📋 Checklist

- [ ] Read QUICKSTART_CLASSIFICATION.md
- [ ] Run setup-classification-indexes.js
- [ ] Run analyze-with-openai.js (test with 10 users)
- [ ] Review output and verify classifications look correct
- [ ] Run generate-classification-report.js to see analytics
- [ ] Run backup-classification-data.js to save results
- [ ] Scale up by editing .limit(10) to desired number
- [ ] Implement human review workflow for medium/low confidence

## 🎉 You're Ready!

The Emma Sleep Intent Classification system is now fully integrated and ready to use. Start with the quick start guide and scale up from there.

**Questions?** Check the documentation files or examine the console output from the classification scripts.

---

**Implementation Date:** May 11, 2026
**Status:** ✅ Complete and Ready for Use
**Files:** 4 scripts + 5 documentation files
**Total Size:** ~80KB

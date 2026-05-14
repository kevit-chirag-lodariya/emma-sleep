# Emma Sleep Intent Classification - Implementation Guide

## Overview

The Emma Sleep Intent Classification system has been integrated into the `analyze-with-openai.js` script. This system classifies customer conversations using the Emma Sleep Intent Classification Rulebook v2, which implements the 10-field classification schema based on OpenAI GPT-4o analysis.

## What's Implemented

### 1. Classification Fields (10 fields per conversation)

```json
{
  "conversation_type": "sales|support|mixed|unclassified",
  "sales_sub_type": "new_inquiry|repeat_buyer|abandoned|null",
  "support_sub_type": "delivery|return_refund|product_quality|warranty|payment_order|general|null",
  "funnel_stage_reached": "greeting|need_discovery|product_shown|price_shared|checkout_intent|ordered|null",
  "resolution_signal": "resolved|unresolved|escalated|unknown|null",
  "order_placed": boolean,
  "escalated_to_human": boolean,
  "objection_keywords": ["exact", "phrases"],
  "classifier_confidence": "high|medium|low",
  "classifier_notes": "explanation or empty string"
}
```

### 2. Three-Stage Classification

1. **Stage 1 - Primary Type**: Determines fundamental purpose (SALES, SUPPORT, MIXED, UNCLASSIFIED)
2. **Stage 2 - Sub-type**: Identifies specific need (e.g., new_inquiry, delivery issue)
3. **Stage 3 - Outcome**: Labels what actually happened (funnel stage, resolution signal, order placed)

### 3. Tag Generation

Classification results are automatically converted to tags:

- `ai-used` - Always added
- `come-to-buy` - For sales conversations
- `come-to-support` - For support conversations
- `repeat-customer` - For repeat buyers
- `buy` / `conversion-completed` - When order is placed
- `dropped` - For abandoned sales
- `dropped-at-payment` / `dropped-at-product-selection` - Specific drop points
- `dropped-at-support` - Unresolved support issues
- `escalated-to-human` - When handed off to human agent
- `delivery-issue`, `return-request`, `quality-complaint`, `warranty-claim` - Support-specific tags

## Files Modified / Created

### Modified
- **scripts/analyze-with-openai.js** - Updated with:
  - Emma Sleep Intent Classification rulebook prompts
  - 10-field classification schema
  - Tag generation logic
  - Enhanced reporting and statistics

### New Scripts

#### 1. **scripts/setup-classification-indexes.js**
Creates MongoDB indexes on classification fields for fast querying.

```bash
node scripts/setup-classification-indexes.js
```

Indexes created:
- `classification.conversation_type`
- `classification.sales_sub_type`
- `classification.support_sub_type`
- `classification.funnel_stage_reached`
- `classification.resolution_signal`
- `classification.order_placed`
- `classification.escalated_to_human`
- `classification.classifier_confidence`
- Compound: `(conversation_type + classifier_confidence)`
- `tags`
- `classifiedAt`

#### 2. **scripts/generate-classification-report.js**
Generates comprehensive analytics and distribution reports.

```bash
node scripts/generate-classification-report.js
```

Outputs:
- Conversation type distribution
- Sales sub-type breakdown
- Support sub-type breakdown
- Funnel stage distribution
- Resolution signal distribution
- Classifier confidence levels
- Order placed / escalated statistics
- Top tags
- Low confidence users (requiring human review)

#### 3. **scripts/backup-classification-data.js**
Backs up all classified data with metadata.

```bash
node scripts/backup-classification-data.js
```

Creates:
- JSON backup file: `backups/classification_backup_YYYY-MM-DD.json`
- Metadata file: `backups/classification_metadata_YYYY-MM-DD.json`

## Setup Instructions

### Step 1: Create Indexes
```bash
node scripts/setup-classification-indexes.js
```

### Step 2: Classify Users
```bash
node scripts/analyze-with-openai.js
```

This will:
1. Fetch the first 10 users with `ai-used` tag
2. Retrieve their messages
3. Use OpenAI GPT-4o to classify conversations using the rulebook
4. Store classification data and tags in the database
5. Generate a detailed report

### Step 3: Generate Analysis Report
```bash
node scripts/generate-classification-report.js
```

### Step 4: Backup Data
```bash
node scripts/backup-classification-data.js
```

## Database Schema

Each customer document now includes:

```javascript
{
  userId: ObjectId,
  botUserId: String,
  name: String,
  // ... existing fields ...
  
  // NEW: Classification data
  classification: {
    conversation_type: String,
    sales_sub_type: String|null,
    support_sub_type: String|null,
    funnel_stage_reached: String|null,
    resolution_signal: String|null,
    order_placed: Boolean,
    escalated_to_human: Boolean,
    objection_keywords: [String],
    classifier_confidence: String,
    classifier_notes: String
  },
  
  // Updated tags array
  tags: [String],
  
  // Classification timestamp
  classifiedAt: Date
}
```

## Classification Rules (Key Points)

### 1. Intent-Based (Not Keyword-Based)
- GPT-4o reads the FULL conversation context
- Understands natural language across English, Hindi, Hinglish, Gujarati
- Example: "yaar mera wala nahi aaya" = delivery issue (no keywords)

### 2. Context from Bot Messages Matters
- Order ID reference = post-purchase (SUPPORT)
- Payment link sent = checkout_intent stage
- "Connecting to our team" = escalated_to_human = true

### 3. 100-Night Trial Question
- **BEFORE purchase** (no order reference) = SALES evaluation intent
- **AFTER purchase** (bot references order) = SUPPORT return_refund intent

### 4. Confidence Levels
- **HIGH**: All fields clear, no ambiguity
- **MEDIUM**: One-two judgment calls needed
- **LOW**: Genuinely unclear, requires human review

### 5. MIXED Classification Rules
- Both sales AND support threads must have 3+ substantive user messages
- Otherwise classify as whichever is primary

## Querying Classified Data

### MongoDB Query Examples

```javascript
// Find all sales conversations
db.customers.find({ "classification.conversation_type": "sales" })

// Find conversations with high confidence
db.customers.find({ "classification.classifier_confidence": "high" })

// Find orders placed
db.customers.find({ "classification.order_placed": true })

// Find support issues resolved
db.customers.find({ 
  "classification.conversation_type": "support",
  "classification.resolution_signal": "resolved"
})

// Find abandoned sales at checkout
db.customers.find({
  "classification.sales_sub_type": "abandoned",
  "classification.funnel_stage_reached": "checkout_intent"
})

// Find escalated conversations
db.customers.find({ "classification.escalated_to_human": true })

// Find by tags
db.customers.find({ tags: { $in: ["dropped-at-payment", "conversion-completed"] } })
```

## Scaling Up

To classify more than 10 users, modify `analyze-with-openai.js`:

```javascript
// Line 122-126
const users = await customersCollection
  .find({ tags: 'ai-used' })
  .limit(100)  // Change from 10 to desired number
  .project({ userId: 1, botUserId: 1, name: 1, customFields: 1 })
  .toArray();
```

## Human Review Workflow

For conversations with `classifier_confidence: "medium"` or `"low"`:

1. Run: `node scripts/generate-classification-report.js`
2. Review low-confidence users listed at the bottom
3. Manually verify classification against the rulebook
4. Update `classification` field in database if needed
5. Update `classifier_confidence` to "high" if verified

## Output Example

```
=== Classification Summary ===
Phone: +919876543210 | Name: John Doe
Type: sales | Sub-Type: new_inquiry
Funnel Stage: price_shared | Resolution: N/A
Order Placed: false | Escalated: false
Confidence: high
Objections: ["thoda mehnga hai", "discount milega kya"]
Tags: [ai-used, come-to-buy, dropped-at-product-selection]
```

## Performance Notes

- GPT-4o mini costs ~$0.15/1000 input tokens, ~$0.60/1000 output tokens
- Average conversation = 2,000-3,000 tokens
- 10 classifications ≈ $0.03-0.05
- 100 classifications ≈ $0.30-0.50
- Use `limit()` in production to batch process

## Troubleshooting

### Issue: "Could not parse JSON from OpenAI response"
- Check OpenAI API response in logs
- Verify GPT-4o is returning valid JSON
- May need to increase `max_tokens` in API call

### Issue: Low confidence classifications
- Conversation may be genuinely ambiguous
- Very short conversations (3-5 messages)
- Mixed language with unclear intent
- Mark for human review

### Issue: Missing classification data
- Ensure `analysis` object is returned from OpenAI
- Check database connection and write permissions
- Verify messages collection has required fields

## Related Documentation

- **Emma Sleep Intent Classification Rulebook v2** - Emma_Sleep_Intent_Classification_Rulebook_v2.docx
- **System Prompt** - See `systemPrompt` variable in analyze-with-openai.js
- **OpenAI Documentation** - https://platform.openai.com/docs/guides/gpt-4o

## Next Steps

1. ✅ Run `setup-classification-indexes.js` to prepare database
2. ✅ Run `analyze-with-openai.js` to classify initial batch
3. ✅ Run `generate-classification-report.js` to review results
4. ✅ Run `backup-classification-data.js` to save data
5. Scale up batch sizes and implement continuous classification
6. Set up human review workflow for medium/low confidence results
7. Monitor accuracy and refine system prompt if needed

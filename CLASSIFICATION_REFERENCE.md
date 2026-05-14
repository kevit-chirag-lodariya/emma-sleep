# Emma Sleep Classification - Quick Reference Card

## The 10 Fields

```
1. conversation_type    → sales | support | mixed | unclassified
2. sales_sub_type       → new_inquiry | repeat_buyer | abandoned | null
3. support_sub_type     → delivery | return_refund | product_quality | warranty | payment_order | general | null
4. funnel_stage_reached → greeting | need_discovery | product_shown | price_shared | checkout_intent | ordered | null
5. resolution_signal    → resolved | unresolved | escalated | unknown | null
6. order_placed         → true | false
7. escalated_to_human   → true | false
8. objection_keywords   → ["array", "of", "phrases"]
9. classifier_confidence→ high | medium | low
10. classifier_notes    → "explanation or empty string"
```

## Classification Logic

### Stage 1: Type (What is the fundamental purpose?)

| Type | Signals | Example |
|------|---------|---------|
| **SALES** | Evaluating, comparing, or purchasing | "Emma ke baare mein batao, kitne ka hai?" |
| **SUPPORT** | Already ordered/received, needs help | "mera order nahi aaya" |
| **MIXED** | Both sales AND support, 3+ messages each | Issue resolved → asks about second purchase |
| **UNCLASSIFIED** | No clear intent, <3 messages | Spam, wrong number, no engagement |

### Stage 2: Sub-Type (What specific need?)

**SALES Sub-Types:**
- `new_inquiry`: First-time buyer exploring
- `repeat_buyer`: Prior Emma customer buying again
- `abandoned`: Showed buying intent but didn't order

**SUPPORT Sub-Types:**
- `delivery`: "Where's my order?"
- `return_refund`: "I want to return this"
- `product_quality`: "Has defect/comfort issue"
- `warranty`: "Invoking 15-year warranty"
- `payment_order`: "Wrong charge/invoice needed"
- `general`: Other post-purchase questions

### Stage 3: Outcomes (What actually happened?)

**Funnel Stages (Sales):**
```
greeting → need_discovery → product_shown → price_shared → checkout_intent → ordered
```

**Resolution Signals (Support):**
```
resolved: User acknowledged satisfaction
unresolved: Person left frustrated
escalated: Bot handed to human
unknown: Unclear from conversation
```

## Critical Rules

### Rule 1: Read BOTH Sides
```
❌ Only read user messages
✅ Read user AND bot messages
   (bot messages reveal: order IDs, payment links, escalation)
```

### Rule 2: 100-Night Trial Question
```
PRE-PURCHASE (no order reference) → SALES evaluation
POST-PURCHASE (bot referenced order) → SUPPORT return intent
```

### Rule 3: MIXED Definition
```
BOTH threads must have 3+ substantive user messages
Otherwise → classify as single primary type
```

### Rule 4: order_placed = true
```
❌ User said "ok, I'll buy"
✅ Bot sent order ID OR user confirmed order placed
   (Intent to buy ≠ order placed)
```

### Rule 5: resolution_signal = resolved
```
❌ Bot gave detailed answer
✅ Bot answered AND user acknowledged (ok/thanks/got it)
   (Bot's answer alone is not enough)
```

## Confidence Levels

| Level | Percentage | When to Use | Action |
|-------|-----------|-------------|--------|
| 🟢 HIGH | 75%+ | Clear intent, no ambiguity | ✅ Use directly in analysis |
| 🟡 MEDIUM | 20%+ | One-two judgment calls | ⚠️ Recommend human review |
| 🔴 LOW | 5%+ | Genuinely unclear | 🔴 Mandatory re-review |

## Common Patterns

### ✅ SALES + new_inquiry → dropped
- User asking about product
- Never placed order
- Tag: `dropped-at-product-selection`

### ✅ SALES → price_shared stage
- User learned price → went silent
- Tag: `dropped-at-product-selection`

### ✅ SUPPORT + delivery sub-type
- User: "where is my order"
- Tag: `delivery-issue`

### ✅ SUPPORT + unresolved signal
- Last user message shows frustration
- Tag: `dropped-at-support`

### ✅ SALES + checkout_intent
- User asked for payment link
- Order not placed (silent after)
- Tag: `dropped-at-payment`

### ✅ MIXED conversation
- Both sales and support substantial
- Tags: `come-to-buy` + `come-to-support`

## Auto-Generated Tags

```
Always:           ai-used
Type:            come-to-buy | come-to-support | both
Outcome:         buy | conversion-completed | dropped
Funnel Drop:     dropped-at-payment | dropped-at-product-selection
Support:         delivery-issue | return-request | quality-complaint | warranty-claim
Special:         repeat-customer | escalated-to-human | dropped-at-support
```

## Tricky Scenarios

### Scenario A: Short Conversation (3-5 messages)
```
❌ Assume unclassified just because it's short
✅ If intent is clear → classify with medium confidence
   Only use unclassified if intent is genuinely absent
```

### Scenario B: User Mentions Competitor
```
Example: "Wakefit se better kaise hai Emma?"
Classification: SALES / new_inquiry (evaluation mode)
Note: Competitor name in classifier_notes
```

### Scenario C: User Angry, Problem Unclear
```
Example: "Bahut bura service hai, kaafi time ho gaya"
Classification: SUPPORT / general
Signal: unresolved (no closure)
Confidence: medium
Note: Explain vague problem in classifier_notes
```

### Scenario D: Bot Error Mid-Conversation
```
Classify based on conversation BEFORE error
Mark resolution_signal = unresolved if issue not resolved
Note: bot_error_detected in classifier_notes
```

### Scenario E: User Gifting Product
```
Still SALES conversation (person is buying)
Note: gifting_intent: true in classifier_notes
Classification: new_inquiry (unless prior Emma customer)
```

## MongoDB Queries

### Find Specific Types
```javascript
// Sales conversations
db.customers.find({ "classification.conversation_type": "sales" })

// Support conversations
db.customers.find({ "classification.conversation_type": "support" })

// Mixed conversations
db.customers.find({ "classification.conversation_type": "mixed" })
```

### Find by Sub-Type
```javascript
// New inquiry (first-time buyers)
db.customers.find({ "classification.sales_sub_type": "new_inquiry" })

// Repeat buyers
db.customers.find({ "classification.sales_sub_type": "repeat_buyer" })

// Abandoned sales
db.customers.find({ "classification.sales_sub_type": "abandoned" })

// Delivery issues
db.customers.find({ "classification.support_sub_type": "delivery" })
```

### Find by Outcome
```javascript
// Orders placed
db.customers.find({ "classification.order_placed": true })

// Escalated to human
db.customers.find({ "classification.escalated_to_human": true })

// Unresolved support
db.customers.find({
  "classification.conversation_type": "support",
  "classification.resolution_signal": "unresolved"
})

// Abandoned at payment
db.customers.find({
  "classification.sales_sub_type": "abandoned",
  "classification.funnel_stage_reached": "checkout_intent"
})
```

### Find by Confidence
```javascript
// High confidence (review 5%)
db.customers.find({ "classification.classifier_confidence": "high" })

// Medium confidence (human verify)
db.customers.find({ "classification.classifier_confidence": "medium" })

// Low confidence (mandatory review)
db.customers.find({ "classification.classifier_confidence": "low" })
```

### Find by Tags
```javascript
// Conversion completed
db.customers.find({ tags: "conversion-completed" })

// Dropped at payment
db.customers.find({ tags: "dropped-at-payment" })

// Escalated
db.customers.find({ tags: "escalated-to-human" })

// Multiple conditions
db.customers.find({ tags: { $in: ["dropped-at-payment", "dropped-at-product-selection"] } })
```

## Setup Commands

```bash
# 1. Create indexes
node scripts/setup-classification-indexes.js

# 2. Classify users (modify .limit(10) to scale)
node scripts/analyze-with-openai.js

# 3. Generate report
node scripts/generate-classification-report.js

# 4. Backup data
node scripts/backup-classification-data.js
```

## Key Metrics to Track

| Metric | Formula | Action if High |
|--------|---------|----------------|
| **Abandoned Conversion Rate** | abandoned / total_sales | Review drop points |
| **Unresolved Support %** | unresolved / total_support | Improve support process |
| **Low Confidence %** | low_confidence / total | Refine classification prompts |
| **Escalation Rate** | escalated / total | Review support capacity |
| **Repeat Buyer %** | repeat_buyer / total_sales | Increase for growth |

## Human Review Checklist

For each low-confidence classification:
- [ ] Read full conversation (user + bot messages)
- [ ] What is the fundamental purpose?
- [ ] What specific need are they fulfilling?
- [ ] What actually happened by the end?
- [ ] Update classification if needed
- [ ] Mark classifier_confidence as high after review

## Language Understanding

The system understands:
- ✅ English: "I want a mattress"
- ✅ Hindi: "Mujhe mattress chahiye"
- ✅ Hinglish: "Bhai mattress kaisa hai?"
- ✅ Gujarati: "Manjare kaiso chhe?"

It parses meaning, not keywords:
- "Bohot mehnga hai" = price objection
- "Mera dhyan rakho" (frustrated) = unresolved issue
- "100 raat wali policy" = varies by context

## Troubleshooting

| Problem | Solution |
|---------|----------|
| No classifications saved | Check OpenAI API key in .env |
| JSON parse error | Increase max_tokens in API call |
| Low confidence high | Review conversation length, language clarity |
| Database errors | Verify MongoDB is running, indexes exist |
| Timeout on large batches | Reduce batch size, add delays between requests |

---

**Print this card for quick reference during classification sessions.**

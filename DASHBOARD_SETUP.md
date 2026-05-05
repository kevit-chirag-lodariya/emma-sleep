# Analytics Dashboard - Setup & Usage Guide

## 🎯 What You Have

A complete backend analytics dashboard system that visualizes AI-powered customer behavior analysis without any frontend panel code.

---

## 🚀 Quick Start

### 1. Ensure Server is Running
```bash
npm run start:prod
```

### 2. Open Dashboard
```
http://localhost:3000/
```

### 3. View Real-Time Analytics
- Conversion metrics
- Customer tags
- Dropout analysis
- Funnel visualization

---

## 📊 Dashboard Features

### Overview Section
- **Total Customers**: 505
- **AI-Analyzed**: 75 (14.85%)
- **Conversion Rate**: 62.50%
- **Dropout Rate**: 50.00%
- **Purchase Intent**: 8 customers
- **Support Needs**: 2 customers

### Conversion Funnel
Visual representation of customer journey:
```
Total Users (505)
    ↓ 14.85%
AI Used (75)
    ↓ 1.98%
Viewed Products (10)
    ↓ 1.58%
Added to Cart (8)
    ↓ 0.99%
Checkout Initiated (5)
    ↓ 0.99%
Converted (5) ✅
```

### Interactive Charts
1. **Tag Distribution** - Pie chart showing customer segments
2. **Sentiment Analysis** - Positive vs Negative sentiment
3. **User Intent** - Buy vs Support vs Hybrid
4. **Dropout Reasons** - Why customers abandoned

### Data Tables
1. **Recent Conversions** - Last 10 successful customers
2. **Recent Dropouts** - Last 10 abandoned customers

---

## 🔌 API Endpoints

All data is accessible via RESTful APIs:

### Dashboard Overview
```bash
curl http://localhost:3000/analytics/dashboard | jq .
```

### Conversion Funnel
```bash
curl http://localhost:3000/analytics/conversion-funnel | jq .
```

### Dropout Analysis
```bash
curl http://localhost:3000/analytics/dropout-analysis | jq .
```

### Recent Conversions
```bash
curl http://localhost:3000/analytics/conversions?limit=10 | jq .
```

### Recent Dropouts
```bash
curl http://localhost:3000/analytics/dropouts?limit=10 | jq .
```

### Filter by Tag
```bash
# Get all conversions
curl http://localhost:3000/analytics/tags/conversion-completed | jq .

# Get all dropouts
curl http://localhost:3000/analytics/tags/dropped | jq .

# Get purchase intent customers
curl http://localhost:3000/analytics/tags/come-to-buy | jq .
```

### Customer Details
```bash
curl http://localhost:3000/analytics/customer/69df4ebb9c11985c0e2dc30a | jq .
```

### Search Customers
```bash
curl "http://localhost:3000/analytics/search?q=+918942838999" | jq .
```

---

## 📈 Current Analytics

### Conversion Stats
- **Completed**: 5 conversions
- **Dropped**: 4 dropouts
- **In Progress**: 1 customer
- **Overall Rate**: 62.50%

### Tag Distribution
- `ai-used`: 75 (all analyzed customers)
- `come-to-buy`: 8 (purchase intent)
- `buy`: 5 (completed purchase)
- `conversion-completed`: 5
- `dropped`: 4
- `dropped-at-support`: 2
- `dropped-at-product-selection`: 2
- `come-to-support`: 2
- `conversion-in-progress`: 1

### Customer Insights
- High engagement customers: Tejas (1179 messages), ~Sunay Devaliya (1072 messages)
- Main dropout reason: Payment hesitation
- Common concern: Product visibility & options clarity

---

## 📁 Architecture

### Backend Files
```
src/
├── analytics.service.ts       (Core logic & MongoDB queries)
├── analytics.controller.ts    (8 API endpoints)
├── app.module.ts             (Updated with analytics)
├── app.controller.ts         (Updated to serve dashboard)
└── main.ts                   (Updated for static files)

public/
└── dashboard.html            (Beautiful responsive UI)
```

### Key Technologies
- **NestJS** - Framework
- **MongoDB** - Database with aggregation pipelines
- **Chart.js** - Interactive charts
- **Responsive Design** - Mobile-friendly

---

## 🔄 Data Flow

```
1. OpenAI Analysis Script
   ↓
   Analyzes customer conversations
   Assigns intelligent tags
   
2. MongoDB
   ↓
   Stores tagged customer data
   
3. Analytics Service
   ↓
   Queries with aggregation pipelines
   Calculates metrics & statistics
   
4. API Endpoints
   ↓
   Returns JSON data
   
5. Dashboard UI
   ↓
   Visualizes data with charts & tables
```

---

## 🎯 Use Cases

### 1. Monitor Conversions
- Check real-time conversion rates
- Identify high-performing customers
- Track recent successful orders

### 2. Analyze Dropouts
- Understand why customers abandon
- Identify dropout patterns
- Plan retention strategies

### 3. Segment Customers
- Filter by intent (buy/support)
- View customer journey stages
- Find high-value customers

### 4. Search & Filter
- Find customers by phone
- Look up by name
- Get detailed customer profiles
- View full message history

### 5. Business Intelligence
- Export data via APIs
- Build custom reports
- Integrate with other tools
- Track KPIs over time

---

## 🔧 Customization

### Add More Metrics
Edit `src/analytics.service.ts` to add custom analytics methods.

### Customize Charts
Edit `public/dashboard.html` to change chart types or colors.

### Add New Endpoints
Add methods to `AnalyticsService` and routes to `AnalyticsController`.

### Change Refresh Rate
Edit line in `dashboard.html`:
```javascript
setInterval(loadDashboard, 5 * 60 * 1000); // Change 5 to desired minutes
```

---

## 📝 Common Tasks

### View Conversion Funnel
```bash
curl http://localhost:3000/analytics/conversion-funnel
```

### Find Customers Who Dropped at Payment
```bash
curl http://localhost:3000/analytics/tags/dropped-at-payment
```

### Get Top 20 Recent Conversions
```bash
curl "http://localhost:3000/analytics/conversions?limit=20"
```

### Search by Phone Number
```bash
curl "http://localhost:3000/analytics/search?q=+918942838999"
```

### Get Detailed Customer Profile
```bash
curl http://localhost:3000/analytics/customer/69df4ebb9c11985c0e2dc30a
```

---

## ⚙️ System Requirements

- Node.js 18+
- MongoDB running (via docker-compose)
- Port 3000 available
- ~50MB disk space for builds

---

## 🐛 Troubleshooting

### Server Won't Start
```bash
# Check if port 3000 is in use
lsof -i :3000

# Kill process on port 3000
kill -9 <PID>

# Check logs
cat /tmp/server.log
```

### Dashboard Not Loading
1. Ensure server is running: `curl http://localhost:3000/health`
2. Check MongoDB connection: `docker-compose ps`
3. Clear browser cache: Ctrl+Shift+Delete

### API Returns Empty Data
1. Verify customer data exists in MongoDB
2. Run analysis script: `node scripts/analyze-with-openai.js`
3. Check database: `mongo emma-sleep`

---

## 📚 Documentation

- **Full API Docs**: See `DASHBOARD_API.md`
- **Analysis Script**: See `scripts/README_OPENAI_ANALYSIS.md`
- **Model Comparison**: See `scripts/MODEL_COMPARISON.md`

---

## 🎉 Summary

You now have:

✅ **Complete Analytics Backend** - Fully functional without frontend panel
✅ **Beautiful Dashboard UI** - Responsive, interactive, real-time
✅ **REST API** - 8 endpoints for integration & custom use
✅ **MongoDB Queries** - Optimized aggregation pipelines
✅ **Data Visualization** - Charts, tables, funnels, metrics
✅ **Search & Filter** - Find customers by any criteria
✅ **Auto-Refresh** - Updates every 5 minutes
✅ **Mobile Ready** - Works on all devices

**Access now at**: http://localhost:3000/

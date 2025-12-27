# LiDAR Forest Analysis Platform
## Product Owner & Founder Guide

**Version:** 1.0
**Last Updated:** 2025-10-30
**Audience:** Product Owners, Founders, Forest Industry Executives

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Market Opportunity](#market-opportunity)
3. [Platform Overview](#platform-overview)
4. [Feature Roadmap (Forestry Perspective)](#feature-roadmap-forestry-perspective)
5. [Competitive Advantage](#competitive-advantage)
6. [Business Model & Revenue](#business-model--revenue)
7. [Go-to-Market Strategy](#go-to-market-strategy)
8. [Success Metrics & ROI](#success-metrics--roi)
9. [Working with Your Technical Team](#working-with-your-technical-team)
10. [Risk Management](#risk-management)
11. [Regulatory Compliance & Standards](#regulatory-compliance--standards)
12. [Frequently Asked Questions](#frequently-asked-questions)

---

## Executive Summary

### What We're Building

A cloud-based LiDAR forest analysis platform that **transforms days of manual forest inventory work into minutes of automated processing**, delivering accurate tree measurements, species classification, and carbon stock estimates that meet professional forestry standards.

### The Problem

**Traditional forest inventory is:**
- **Time-consuming:** 2-4 weeks of field work for 100-hectare assessment
- **Expensive:** $5,000-$15,000 per assessment for professional cruising
- **Inconsistent:** Variable accuracy depending on crew experience
- **Dangerous:** Field crews working in remote terrain
- **Limited coverage:** Sample-based, not complete enumeration

**Current LiDAR desktop tools require:**
- Expensive software licenses ($3,000-$10,000/year)
- Specialized GIS expertise
- Powerful desktop computers
- Manual processing workflows
- No cloud collaboration

### The Solution

**LiDAR Forest Analysis Platform provides:**
- **Upload & Analyze:** Drag-and-drop LiDAR files, get results in minutes
- **Automated Tree Detection:** AI-powered individual tree identification
- **Species Classification:** Machine learning for common species
- **Professional Reports:** FIA-compliant inventory reports
- **Carbon Credit Ready:** VCS/CAR-compatible carbon stock estimates
- **Cloud Collaboration:** Share results with teams and clients
- **Pay-as-you-go:** No expensive software licenses

### Business Impact

**For Forest Managers:**
- 75% reduction in inventory time (weeks to hours)
- 60% cost savings vs. traditional cruising
- 95%+ enumeration accuracy (vs. 85% statistical sampling)
- Immediate carbon credit verification
- Defensible data for litigation/disputes

**For Consulting Foresters:**
- 5x more clients served with same staff
- Higher-margin services (data analysis vs. field work)
- Competitive differentiation
- Scalable business model

**For Landowners:**
- Faster forest management decisions
- Lower-cost periodic monitoring
- Carbon credit market access
- Transparent, auditable data

---

## Market Opportunity

### Total Addressable Market

**$2.4B Global Forest Management Software Market**
- Growing at 12% CAGR (2023-2030)
- Driven by: carbon markets, sustainable forestry, digital transformation

**LiDAR Technology Adoption:**
- 45% of commercial forest land in US now has LiDAR coverage
- Cost of LiDAR acquisition dropping 20% annually
- Drones making LiDAR accessible to smaller operations

**Carbon Credit Market:**
- $2B voluntary carbon market (2024)
- Expected $50B by 2030
- LiDAR verification becoming standard practice

### Target Customer Segments

**Primary (Year 1-2):**

1. **Consulting Foresters** (15,000 professionals in North America)
   - Need: Efficient inventory for multiple clients
   - Budget: $200-500/month subscription
   - Volume: 10-50 analyses per month
   - Pain point: Manual desktop GIS workflows

2. **Forest Management Companies** (500 major firms)
   - Need: Scalable monitoring of large land holdings
   - Budget: $2,000-10,000/month enterprise
   - Volume: 100+ analyses per month
   - Pain point: Expensive field crews, inconsistent data

3. **Carbon Project Developers** (200 active project developers)
   - Need: Baseline and verification for carbon credits
   - Budget: $5,000-20,000 per project
   - Volume: 5-20 projects per year
   - Pain point: Expensive third-party verification

**Secondary (Year 3+):**

4. **Private Landowners** (10M+ forest landowners in US)
   - Need: Affordable forest inventory and management planning
   - Budget: $50-200 per analysis (pay-per-use)
   - Volume: 1-5 analyses per year
   - Pain point: Can't afford professional forester

5. **Government Agencies** (Federal, state, local forestry departments)
   - Need: Large-scale forest monitoring and reporting
   - Budget: $50,000-500,000 enterprise contracts
   - Volume: Continuous monitoring
   - Pain point: Budget constraints, large geographic areas

### Market Entry Strategy

**Phase 1 (Months 1-6): Beta Testing**
- Target: 20-30 consulting foresters
- Geography: Pacific Northwest (OR, WA, BC)
- Focus: Douglas Fir/Western Hemlock forests
- Goal: Validate accuracy, refine UX, gather testimonials

**Phase 2 (Months 7-12): Initial Launch**
- Target: 200 paid customers
- Geography: Western US + Southeast US
- Expand: Species models, report templates
- Goal: $50K MRR, product-market fit

**Phase 3 (Year 2): Scale**
- Target: 1,000 customers
- Geography: North America
- Enterprise: Large forest management firms
- Goal: $500K MRR, break-even

**Phase 4 (Year 3+): Global Expansion**
- Geography: Europe, South America, Asia-Pacific
- Partnerships: Carbon registries, certification bodies
- Enterprise: Government contracts
- Goal: $5M ARR, Series A fundraising

---

## Platform Overview

### Core Features (For Forestry Users)

#### 1. LiDAR File Upload & Management

**What it does:**
Upload LiDAR files (LAS/LAZ format) from aerial surveys, drones, or data providers.

**Why it matters:**
- No expensive desktop GIS software needed
- Works on any device with a web browser
- Handles large files (up to 10GB) that crash desktop tools
- Automatic quality checks before processing

**Use cases:**
- Upload contractor-delivered LiDAR data
- Process drone survey results
- Import public LiDAR datasets (USGS, state agencies)

#### 2. Automated Tree Detection

**What it does:**
Identifies individual trees from point cloud data, providing location, height, and crown diameter.

**Why it matters:**
- Complete enumeration vs. statistical sampling
- Consistent accuracy across entire forest
- Detects trees in dense canopy conditions
- Processes 100 hectares in 5 minutes

**Forestry metrics provided:**
- Tree count and density (stems per hectare)
- Height distribution
- Crown diameter and canopy cover
- Spatial pattern analysis

**Accuracy targets:**
- 90%+ detection for trees >15cm DBH
- ±0.5m height accuracy
- ±1.0m crown diameter accuracy

#### 3. Species Classification

**What it does:**
Uses machine learning to predict tree species from LiDAR metrics and spectral data.

**Why it matters:**
- Reduces field verification needs
- Enables species-level volume and value estimates
- Critical for carbon accounting (species-specific growth rates)
- Supports biodiversity assessments

**Supported species (by region):**

**Pacific Northwest:**
- Douglas Fir (*Pseudotsuga menziesii*)
- Western Hemlock (*Tsuga heterophylla*)
- Western Red Cedar (*Thuja plicata*)
- Red Alder (*Alnus rubra*)
- Bigleaf Maple (*Acer macrophyllum*)

**Southeast US:**
- Loblolly Pine (*Pinus taeda*)
- Slash Pine (*Pinus elliottii*)
- Longleaf Pine (*Pinus palustris*)
- Sweetgum (*Liquidambar styraciflua*)
- Oak species (*Quercus* spp.)

**Accuracy targets:**
- 80%+ classification accuracy for common species
- Genus-level classification for less common species
- Option for user-provided training data

#### 4. Forest Inventory Reports

**What it does:**
Generates professional forestry reports compliant with industry standards (FIA, FRI).

**Why it matters:**
- Meets bank/investor due diligence requirements
- Defensible data for legal purposes
- Compatible with forest management planning software
- Export formats: PDF, Excel, Shapefiles

**Report sections:**

**Executive Summary:**
- Total area, total volume, basal area
- Species composition
- Stand structure classification
- Key recommendations

**Detailed Inventory Tables:**
- Tree list (species, DBH, height, condition)
- Diameter distribution by species
- Height distribution by species
- Volume by species and product class

**Stand-Level Summaries:**
- Stands/management units
- Stocking levels (SDI, BA, TPH)
- Timber value estimates
- Silvicultural prescriptions

**Maps & Visualizations:**
- Stand boundaries
- Canopy height model
- Species distribution map
- Access and operational constraints

#### 5. Carbon Stock Estimation

**What it does:**
Calculates above-ground carbon stocks using FIA equations and species-specific allometrics.

**Why it matters:**
- Baseline for carbon credit projects
- Monitoring for improved forest management
- Verification for carbon offset sales
- Meets VCS, CAR, ACR standards

**Outputs:**
- Total carbon stock (metric tons CO₂e)
- Carbon stock by species
- Carbon stock by diameter class
- Uncertainty/confidence intervals
- Change detection (if time-series data available)

**Carbon credit applications:**
- Improved Forest Management (IFM)
- Avoided Conversion (AC)
- Afforestation/Reforestation (A/R)
- REDD+ (international)

#### 6. 3D Visualization

**What it does:**
Interactive 3D viewer to explore point cloud data and detected trees.

**Why it matters:**
- Visual quality control for tree detection
- Client presentations and stakeholder communication
- Field crew navigation and work planning
- Training and education

**Features:**
- Rotate, zoom, pan through forest canopy
- Color by height, intensity, or species
- Measure distances and heights
- Clip cross-sections to see vertical structure
- Export screenshots and animations

### Technical Architecture (Simplified)

**For non-technical Product Owners:**

```
User's Browser (React Web App)
    ↓
Upload LiDAR File → Cloud Storage (S3)
    ↓
Processing Queue → Python Analysis Engine
    ↓
Results Database (PostgreSQL)
    ↓
Reports & Visualizations → User's Browser
```

**What this means:**
- **Cloud-based:** No software to install, works anywhere
- **Scalable:** Handles 1 user or 1,000 users
- **Fast:** Parallel processing for quick results
- **Secure:** Bank-level encryption and access controls
- **Reliable:** 99.5% uptime guarantee

---

## Feature Roadmap (Forestry Perspective)

### Phase 1: Minimum Viable Product (MVP)
**Timeline:** Months 1-6
**Status:** Foundation for beta testing

**Features:**
- ✅ LiDAR file upload (LAS/LAZ)
- ✅ Basic tree detection (height, location)
- ✅ Simple inventory report (tree count, heights)
- ✅ 3D point cloud viewer
- ✅ User accounts and project management

**Target customers:** 20-30 beta testers (consulting foresters)
**Success criteria:** 85%+ tree detection accuracy, <10 min processing time

### Phase 2: Professional Forestry Tools
**Timeline:** Months 7-12
**Status:** Initial commercial launch

**New features:**
- 🔄 Species classification (5-10 common species per region)
- 🔄 DBH estimation from height and crown diameter
- 🔄 Volume and biomass calculations (FIA equations)
- 🔄 FIA-compliant inventory reports
- 🔄 Stand delineation and summaries
- 🔄 Export to Shapefiles and Excel

**Target customers:** 200 paying customers
**Success criteria:** 90% customer retention, NPS >50

### Phase 3: Carbon Credit & Advanced Analytics
**Timeline:** Year 2
**Status:** Planned

**New features:**
- 📋 Carbon stock estimation (VCS/CAR compliant)
- 📋 Change detection (time-series analysis)
- 📋 Growth and yield projections
- 📋 Timber value appraisal
- 📋 Harvest planning and optimization
- 📋 Multi-user collaboration and sharing

**Target customers:** 1,000 customers including carbon project developers
**Success criteria:** 10 enterprise customers, $500K MRR

### Phase 4: Enterprise & Integration
**Timeline:** Year 3
**Status:** Future vision

**New features:**
- 📋 API for third-party integrations
- 📋 Mobile app for field data collection
- 📋 Integration with forest planning software
- 📋 Custom species models (user-provided training data)
- 📋 White-label solution for enterprise
- 📋 Government reporting automation

**Target customers:** Enterprise and government contracts
**Success criteria:** $5M ARR, Series A funding

### Feature Prioritization Framework

**How we decide what to build next:**

1. **Customer demand:** What are paying customers requesting?
2. **Revenue impact:** What features drive upgrades/conversions?
3. **Competitive advantage:** What differentiates us from competitors?
4. **Technical feasibility:** Can we build it with current resources?
5. **Strategic value:** Does it open new markets or customer segments?

**Example prioritization:**

| Feature | Demand | Revenue | Competitive | Feasible | Strategic | **Priority** |
|---------|--------|---------|-------------|----------|-----------|--------------|
| Species classification | High | High | High | Medium | High | **P0** |
| Carbon stock estimation | High | Very High | Medium | High | Very High | **P0** |
| Mobile field app | Medium | Low | Medium | Medium | Medium | **P2** |
| Harvest optimization | Medium | High | High | Low | Medium | **P1** |

---

## Competitive Advantage

### Current Alternatives

#### 1. Traditional Field Cruising

**How it works:**
- Field crews measure sample plots
- Statistical extrapolation to entire forest
- Manual data entry and analysis

**Strengths:**
- Proven methodology
- Ground-truth accuracy for sampled trees
- Can assess non-measurable factors (insect damage, etc.)

**Weaknesses:**
- Expensive ($5K-$15K per assessment)
- Time-consuming (2-4 weeks)
- Sample-based (statistical uncertainty)
- Dangerous (remote terrain, wildlife)
- Not repeatable (different crews = different results)

**Our advantage:**
- 60% lower cost
- 95% faster (hours vs. weeks)
- 100% enumeration (no sampling error)
- Repeatable and auditable

#### 2. Desktop GIS Software (ArcGIS, QGIS + FUSION/LAStools)

**How it works:**
- Purchase expensive software licenses
- Manually process LiDAR data locally
- Export results to reporting tools

**Strengths:**
- Full control over processing
- Customizable workflows
- Works offline

**Weaknesses:**
- Expensive licenses ($3K-$10K/year)
- Steep learning curve (GIS expertise required)
- Requires powerful computer
- Manual, time-consuming workflows
- No collaboration features
- No built-in forestry reporting

**Our advantage:**
- No software to install (cloud-based)
- Pay-as-you-go pricing
- Automated workflows (minutes vs. hours)
- Built-in forestry reports
- Cloud collaboration
- Works on any device

#### 3. Specialized LiDAR Companies (e.g., Trimble Forestry, Reveal)

**How it works:**
- Outsource LiDAR processing to service provider
- Receive reports/data after processing
- Annual contracts or per-project pricing

**Strengths:**
- Full-service solution
- Expert processing
- Customized deliverables

**Weaknesses:**
- Very expensive ($500-$2,000 per project)
- Long turnaround (days to weeks)
- No self-service option
- Vendor lock-in
- Limited transparency

**Our advantage:**
- Self-service platform (immediate results)
- 70% lower cost
- Full transparency (see methodology)
- Keep control of your data

### Unique Value Proposition

**"Professional-grade forest inventory from LiDAR data in minutes, not weeks—at a fraction of the cost."**

**Why we win:**

1. **Forestry-first design:**
   - Built by foresters, for foresters
   - Outputs align with forestry workflows
   - Terminology and metrics foresters understand

2. **Cloud-native platform:**
   - No software installation
   - Scalable processing
   - Accessible anywhere

3. **Automated workflows:**
   - Upload → Process → Report in one click
   - AI-powered tree detection and species classification
   - Built-in quality control

4. **Transparent pricing:**
   - Pay-as-you-go (no long-term contracts)
   - Clear pricing tiers
   - No hidden fees

5. **Standards-compliant:**
   - FIA inventory standards
   - VCS/CAR carbon accounting
   - WCAG accessibility
   - Enterprise security

### Defensible Moats

**What prevents competitors from copying us:**

1. **Proprietary algorithms:**
   - Custom tree detection optimized for forestry
   - Species classification models trained on regional data
   - Continuous improvement from user feedback

2. **Data network effects:**
   - More users → more training data → better models
   - Regional species models improve with use
   - User-contributed validation data

3. **Domain expertise:**
   - Team of professional foresters
   - Deep understanding of forestry workflows
   - Relationships with carbon registries and certification bodies

4. **Platform integrations:**
   - API partnerships with forest planning software
   - Direct integration with carbon registries
   - GIS data provider partnerships

5. **Regulatory compliance:**
   - Pre-built compliance with FIA, VCS, CAR standards
   - Audit trails and documentation
   - Trusted by certification bodies

---

## Business Model & Revenue

### Pricing Strategy

#### Tier 1: Professional (Individual Consultants)
**$299/month or $2,999/year**

**Includes:**
- 25 analyses per month (up to 100 hectares each)
- All core features (tree detection, species, reports)
- Carbon stock estimation
- 100GB storage
- Email support
- Export to PDF, Excel, Shapefile

**Target customer:** Solo consulting foresters, small firms
**Unit economics:** $2,999 annual × 500 customers = **$1.5M ARR**

#### Tier 2: Business (Small Firms)
**$899/month or $8,999/year**

**Includes:**
- 100 analyses per month
- Multi-user accounts (up to 5 users)
- Team collaboration and project sharing
- Priority processing
- API access (100 requests/day)
- Phone + email support
- 500GB storage

**Target customer:** Forest management firms (2-10 employees)
**Unit economics:** $8,999 annual × 200 customers = **$1.8M ARR**

#### Tier 3: Enterprise (Custom)
**$2,000-$10,000/month (negotiated)**

**Includes:**
- Unlimited analyses
- Unlimited users
- Custom species models
- White-label option
- Dedicated support
- SLA guarantees (99.9% uptime)
- Custom integrations
- Unlimited storage

**Target customer:** Large firms, government agencies, carbon project developers
**Unit economics:** $5,000/month average × 50 customers = **$3M ARR**

#### Tier 4: Pay-As-You-Go (Casual Users)
**$49 per analysis**

**Includes:**
- Single analysis
- Basic report
- 30-day data access
- Email support

**Target customer:** Private landowners, occasional users
**Unit economics:** $49 × 2,000 analyses/year = **$98K revenue**

### Revenue Projections

**Year 1 (Initial Launch):**
- Professional: 150 customers × $2,999 = $449K
- Business: 30 customers × $8,999 = $270K
- Enterprise: 5 customers × $60K = $300K
- Pay-per-use: 500 analyses × $49 = $25K
- **Total Year 1: $1.04M**

**Year 2 (Growth):**
- Professional: 500 customers × $2,999 = $1.5M
- Business: 100 customers × $8,999 = $900K
- Enterprise: 20 customers × $60K = $1.2M
- Pay-per-use: 2,000 analyses × $49 = $98K
- **Total Year 2: $3.7M**

**Year 3 (Scale):**
- Professional: 1,000 customers × $2,999 = $3.0M
- Business: 250 customers × $8,999 = $2.25M
- Enterprise: 50 customers × $60K = $3.0M
- Pay-per-use: 5,000 analyses × $49 = $245K
- **Total Year 3: $8.5M**

### Cost Structure

**Key costs:**

**Development (Year 1):**
- Engineering team (2 developers): $300K
- Product/design: $100K
- Infrastructure (AWS): $50K
- Total development: **$450K**

**Sales & Marketing (Year 1):**
- Marketing (content, SEO, ads): $100K
- Sales (2 inside sales reps): $150K
- Partnerships: $50K
- Total S&M: **$300K**

**Operations (Year 1):**
- Customer support: $75K
- Infrastructure (scaling): $100K
- Legal, accounting, insurance: $50K
- Total operations: **$225K**

**Total Year 1 Costs: $975K**

### Unit Economics

**Professional tier customer:**
- Annual revenue: $2,999
- Cost to acquire (CAC): $500 (ads, sales time)
- Cost to serve (COGS): $300/year (infrastructure, support)
- Gross margin: $2,199 (73%)
- Payback period: 2.7 months
- Lifetime value (3 years): $6,597
- LTV/CAC ratio: 13.2x ✅

**Business tier customer:**
- Annual revenue: $8,999
- CAC: $1,500 (higher-touch sales)
- COGS: $1,000/year
- Gross margin: $6,499 (72%)
- Payback period: 2.8 months
- LTV (3 years): $19,497
- LTV/CAC ratio: 13.0x ✅

**Enterprise customer:**
- Annual revenue: $60,000
- CAC: $10,000 (enterprise sales cycle)
- COGS: $8,000/year (custom support)
- Gross margin: $42,000 (70%)
- Payback period: 2.9 months
- LTV (3 years): $126,000
- LTV/CAC ratio: 12.6x ✅

**Healthy SaaS metrics:**
- CAC payback < 12 months ✅
- LTV/CAC ratio > 3x ✅
- Gross margin > 70% ✅

---

## Go-to-Market Strategy

### Customer Acquisition Channels

#### 1. Content Marketing & SEO (Organic)

**Strategy:**
Create valuable forestry content to attract organic traffic from foresters searching for solutions.

**Tactics:**
- Blog posts on forestry topics:
  - "How to Use LiDAR for Forest Inventory"
  - "Carbon Credit Basics for Forest Landowners"
  - "Comparing Forest Cruise Methods: Field vs. LiDAR"
- Case studies with customer results
- Technical white papers on methodology
- Video tutorials and webinars
- Forestry podcast appearances

**Investment:** $3K/month (content writer, SEO tools)
**Expected ROI:** 30-50 organic leads/month by Month 6

#### 2. Industry Partnerships

**Strategy:**
Partner with organizations foresters already trust and engage with.

**Target partners:**
- **Forestry consultants associations:**
  - Association of Consulting Foresters (ACF)
  - Society of American Foresters (SAF)
- **LiDAR data providers:**
  - Quantum Spatial, USGS LiDAR portals
  - Drone service providers
- **Carbon registries:**
  - Verra (VCS), Climate Action Reserve (CAR)
  - American Carbon Registry (ACR)
- **Forest management software:**
  - Forest Metrix, ForestView, Trimble
  - Integration partnerships

**Tactics:**
- Conference sponsorships and speaking
- Co-marketing webinars
- Referral partnerships (revenue share)
- Integration partnerships (API access)

**Investment:** $50K/year (memberships, conferences, co-marketing)
**Expected ROI:** 20-30 qualified leads/month

#### 3. Direct Outreach (Sales)

**Strategy:**
Targeted outreach to high-value customers (business and enterprise tiers).

**Target lists:**
- Top 500 forest management companies
- Active carbon project developers (200)
- Large timberland investment organizations (TIMOs)
- Real Estate Investment Trusts (REITs) with forest holdings

**Tactics:**
- Personalized email campaigns
- LinkedIn outreach
- Phone calls to decision-makers
- In-person demos at their office
- Free trial offers

**Investment:** $150K/year (2 inside sales reps)
**Expected ROI:** 10-15 business tier customers, 3-5 enterprise customers

#### 4. Paid Advertising

**Strategy:**
Targeted ads to foresters actively searching for solutions.

**Channels:**
- Google Search Ads:
  - Keywords: "forest inventory software", "LiDAR analysis", "carbon credit verification"
- LinkedIn Ads:
  - Job titles: Forester, Forest Manager, RPF
  - Industries: Forestry, Environmental Consulting
- Industry publications:
  - Forest Business Network, Timberline Magazine
  - SAF newsletters

**Investment:** $5K/month
**Expected ROI:** 15-25 leads/month, 3-5 conversions

#### 5. Referral Program

**Strategy:**
Incentivize existing customers to refer new customers.

**Program design:**
- Refer a customer → 1 month free service
- Referred customer → 20% off first year
- Leaderboard and recognition for top referrers

**Investment:** $20K/year (discounts, tracking system)
**Expected ROI:** 20% of new customers from referrals (Year 2+)

### Launch Plan

#### Pre-Launch (Months 1-3)

**Objectives:**
- Build beta tester list
- Refine product based on feedback
- Create marketing materials

**Activities:**
- Recruit 30 beta testers from personal networks
- Weekly feedback sessions
- Build case studies from beta results
- Create website and demo videos
- Establish social media presence

**Success metrics:**
- 30 active beta users
- 85%+ satisfaction score
- 3 detailed case studies

#### Launch (Month 4)

**Objectives:**
- Generate awareness
- Convert beta users to paid
- Acquire first 50 paid customers

**Activities:**
- Press release and industry media outreach
- SAF/ACF conference presentation
- Launch webinar series
- Special launch pricing (20% off first year)
- Email campaign to beta users

**Success metrics:**
- 100 trial signups
- 50 paid conversions
- 10 case studies/testimonials

#### Growth (Months 5-12)

**Objectives:**
- Scale customer acquisition
- Optimize conversion funnel
- Expand to new regions

**Activities:**
- Monthly webinars and content
- Expand paid advertising
- Hire first sales rep
- Launch referral program
- Add Southeast US species models

**Success metrics:**
- 200 total customers
- $50K MRR
- 60%+ trial-to-paid conversion
- NPS >50

---

## Success Metrics & ROI

### North Star Metric

**Forests Analyzed (Hectares Processed per Month)**

**Why this metric:**
- Directly correlates with customer value delivered
- Leading indicator of revenue
- Measures product stickiness (recurring usage)
- Scales with both customer acquisition and expansion

**Targets:**
- Month 6: 2,000 hectares/month (beta)
- Month 12: 20,000 hectares/month (launch)
- Year 2: 100,000 hectares/month (growth)
- Year 3: 500,000 hectares/month (scale)

### Customer Metrics

#### Acquisition Metrics

**Monthly Signups (Trial Starts):**
- Target: 100/month by Month 12
- Measure: Tracking code on signup page

**Trial-to-Paid Conversion Rate:**
- Target: 60%+ (SaaS benchmark: 25-40%)
- Measure: Signups / paid conversions

**Customer Acquisition Cost (CAC):**
- Target: <$500 (Professional), <$1,500 (Business), <$10K (Enterprise)
- Measure: Total S&M spend / new customers

**CAC Payback Period:**
- Target: <6 months
- Measure: Months to recover acquisition cost

#### Retention Metrics

**Monthly Churn Rate:**
- Target: <5% (SaaS benchmark: 5-7%)
- Measure: Customers lost / total customers

**Net Revenue Retention (NRR):**
- Target: >100% (expansions offset churn)
- Measure: (Revenue - churned + expansion) / starting revenue

**Customer Lifetime Value (LTV):**
- Target: $6,000 (Professional), $18,000 (Business), $120K (Enterprise)
- Measure: Average revenue per customer × retention period

**LTV/CAC Ratio:**
- Target: >3x (SaaS benchmark)
- Measure: LTV / CAC

#### Engagement Metrics

**Active Users (Monthly Active):**
- Target: 80%+ of paid customers active each month
- Measure: Users with ≥1 analysis in 30 days

**Analyses per Customer per Month:**
- Target: 8-12 (Professional), 30-50 (Business)
- Measure: Total analyses / customers

**Feature Adoption:**
- Target: 70%+ use species classification, 50%+ use carbon estimation
- Measure: % of customers using each feature

**Net Promoter Score (NPS):**
- Target: >50 (world-class)
- Measure: Quarterly NPS survey

### Product Metrics

#### Quality Metrics

**Tree Detection Accuracy:**
- Target: 90%+ for trees >15cm DBH
- Measure: Validation against field plots (quarterly)

**Species Classification Accuracy:**
- Target: 80%+ for common species
- Measure: Validation against field verification

**Processing Success Rate:**
- Target: 95%+ successful analyses
- Measure: Successful jobs / total jobs

**Processing Time:**
- Target: <5 minutes for 100-hectare analysis
- Measure: Average time from upload to results

#### Reliability Metrics

**System Uptime:**
- Target: 99.5% (SLA requirement)
- Measure: Monitoring service (Datadog, New Relic)

**Error Rate:**
- Target: <1% of requests fail
- Measure: Failed requests / total requests

**Support Tickets:**
- Target: <10% of customers file tickets per month
- Measure: Tickets / customers

**Time to Resolution:**
- Target: <24 hours (business hours)
- Measure: Ticket close time - ticket open time

### Financial Metrics

**Monthly Recurring Revenue (MRR):**
- Month 6: $15K
- Month 12: $50K
- Year 2: $300K
- Year 3: $700K

**Annual Recurring Revenue (ARR):**
- Year 1: $600K
- Year 2: $3.6M
- Year 3: $8.4M

**Gross Margin:**
- Target: 70%+
- Measure: (Revenue - COGS) / Revenue

**Customer Concentration:**
- Target: No single customer >10% of revenue
- Measure: Largest customer / total revenue

**Cash Burn Rate:**
- Target: 18 months runway minimum
- Measure: Monthly cash burn × months until breakeven

### Dashboard Example

**Executive Dashboard (Monthly Review):**

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| **Growth** |
| New Customers | 23 | 20 | ✅ |
| MRR | $47K | $50K | ⚠️ |
| MRR Growth % | 15% | 20% | ⚠️ |
| **Retention** |
| Churn Rate | 3% | <5% | ✅ |
| NRR | 105% | >100% | ✅ |
| NPS | 62 | >50 | ✅ |
| **Engagement** |
| Active Users % | 78% | 80% | ⚠️ |
| Analyses/Customer | 11 | 10 | ✅ |
| Hectares Processed | 18,500 | 20,000 | ⚠️ |
| **Quality** |
| Detection Accuracy | 92% | 90% | ✅ |
| Uptime | 99.7% | 99.5% | ✅ |
| Processing Time | 4.2 min | <5 min | ✅ |

---

## Working with Your Technical Team

### Product Owner Responsibilities

As a Product Owner with forestry expertise, your role is to bridge the forestry domain knowledge and business requirements with the technical implementation team.

#### 1. Define the "What" and "Why" (Not the "How")

**Your job:**
- Define what features solve customer problems
- Explain why features matter to forestry users
- Prioritize features based on business value

**Technical team's job:**
- Determine how to implement features
- Make architectural and technology decisions
- Estimate effort and complexity

**Example:**

✅ **Good Product Requirement:**
> "We need to calculate basal area per hectare for each forest stand. This is a standard forestry metric that all professional foresters expect in an inventory report. It's used to assess stocking levels and make silvicultural decisions. Formula: BA = (π/4) × Σ(DBH²) / stand area. Should be displayed in m²/ha with one decimal precision."

❌ **Bad Product Requirement:**
> "Use a PostgreSQL aggregate function to sum the DBH squared column multiplied by pi over four..."
> *(This is prescribing the "how"—leave that to engineers)*

#### 2. Validate Forestry Accuracy

**Your expertise is critical for:**

**Species identification validation:**
- Review misclassifications reported by users
- Identify confusing species pairs (e.g., Douglas Fir vs. Grand Fir)
- Suggest additional training data sources

**Measurement accuracy:**
- Validate tree height and DBH estimates against field plots
- Identify systematic biases (e.g., underestimating in dense stands)
- Set acceptable error thresholds

**Report compliance:**
- Ensure reports meet FIA/FRI standards
- Validate carbon accounting methodologies
- Review terminology and units

**Workflow realism:**
- Test features with real forestry workflows
- Identify missing steps or confusing UX
- Ensure outputs integrate with other forestry tools

#### 3. Represent the Customer Voice

**You are the advocate for forestry users:**

**Prioritize customer requests:**
- Categorize feature requests by customer type
- Balance power users vs. casual users
- Identify patterns in support tickets

**Translate technical limitations:**
- When engineers say a feature is "hard," understand why
- Help find simpler alternatives that still meet customer needs
- Decide on trade-offs between accuracy and speed

**Champion usability:**
- Ensure terminology makes sense to foresters
- Push back on technical jargon in the UI
- Advocate for accessibility and inclusivity

#### 4. Write Clear User Stories

**User story format:**

```
As a [type of user]
I want to [perform some action]
So that [I achieve some goal/benefit]

Acceptance Criteria:
- [Specific, testable criteria]
- [Edge cases handled]
- [Error states defined]

Definition of Done:
- [ ] Feature implemented and tested
- [ ] Documentation updated
- [ ] User tested with 3 beta customers
```

**Example forestry user story:**

```
**User Story: Export Inventory Report to Excel**

As a consulting forester
I want to export my inventory report to Excel format
So that I can integrate the data with my existing forest management planning workflow

Acceptance Criteria:
- Export button on report page
- Excel file contains sheets: Summary, Tree List, Stand Table, Species Composition
- Species codes match FIA species codes (e.g., 202 for Douglas Fir)
- DBH in cm, Height in m (metric units)
- File naming: "{ProjectName}_Inventory_{Date}.xlsx"
- Download completes in <10 seconds for reports with <10,000 trees

Edge Cases:
- Empty projects show message "No data to export"
- Very large reports (>100K trees) show warning and option to export subset

Definition of Done:
- [ ] Export works on Chrome, Firefox, Safari
- [ ] Excel file opens correctly in Excel 2016+
- [ ] Field tested with 3 consulting foresters
- [ ] Help documentation includes export instructions
- [ ] Unit tests cover edge cases
```

### Collaborating with Technical Agents

Your technical team uses specialized AI agents (see "Subagent Specifications" document) to accelerate development. Here's how you can work effectively with them:

#### When to Involve Agents

**Domain Expertise Agents:**
- `@forestry-expert-agent`: Validate formulas, terminology, report formats
- `@lidar-processing-agent`: Review tree detection parameters, accuracy targets
- `@gis-spatial-agent`: Validate coordinate systems, spatial data models
- `@regulatory-compliance-agent`: Ensure FIA/VCS/CAR compliance

**Product Agents:**
- `@ux-product-agent`: Design user experiences, validate workflows
- `@qa-testing-agent`: Define acceptance criteria, test scenarios

**Example interaction:**

You (Product Owner) create a feature request:
```
Feature: Automated species classification

Target accuracy: 80% for top 10 species in Pacific Northwest
Required for: Carbon credit projects (species-specific growth rates)
```

Engineer invokes agent:
```
@forestry-expert-agent

What are the top 10 commercial species in Pacific Northwest forests?
For each species, provide:
- Scientific name and FIA species code
- Typical height and DBH ranges
- Key identification characteristics (from LiDAR)
- Allometric equations for biomass estimation
```

Agent provides detailed forestry context, which engineers use to build accurate models.

### Communication Cadence

**Daily standup (15 min):**
- What did you accomplish yesterday?
- What are you working on today?
- Any blockers?

**Weekly planning (1 hour):**
- Review completed work
- Prioritize upcoming tasks
- Discuss technical challenges

**Biweekly product review (1 hour):**
- Demo new features
- Gather feedback from beta users
- Adjust roadmap based on learnings

**Monthly business review (2 hours):**
- Review metrics (MRR, churn, NPS, etc.)
- Discuss strategic direction
- Plan marketing campaigns

### Glossary: Technical Terms for Product Owners

**API (Application Programming Interface):**
A way for our software to connect with other software. Example: Integration with forest planning software.

**CI/CD (Continuous Integration/Continuous Deployment):**
Automated testing and deployment of new code. Means we can ship features faster.

**Latency:**
How long it takes for something to happen (e.g., page load time). Lower is better.

**Scalability:**
Can the system handle growth? If we go from 100 to 10,000 customers, will it still work?

**SLA (Service Level Agreement):**
Our promise of uptime (e.g., 99.5% means <3.6 hours downtime per month).

**Technical debt:**
Shortcuts in code that need to be fixed later. Like deferred maintenance on a building.

**Throughput:**
How many analyses we can process simultaneously. Higher = faster for all users.

**UX (User Experience):**
How easy and pleasant our software is to use. Good UX = happy customers.

---

## Risk Management

### Market Risks

#### Risk 1: Low LiDAR Adoption Among Target Customers

**Description:**
If foresters don't have access to LiDAR data, they can't use our platform.

**Likelihood:** Medium
**Impact:** High

**Mitigation strategies:**
1. **Partner with LiDAR data providers:** Offer discounted LiDAR acquisition through partners
2. **Drone service marketplace:** Connect customers with drone operators for custom surveys
3. **Public data focus:** Help customers find free public LiDAR (USGS, state agencies)
4. **Freemium model:** Free tier for small analyses encourages data acquisition

**Monitoring:**
- Survey customers: "Do you have LiDAR data?" "Where did you get it?"
- Track data sources used in platform
- Measure conversion rate by data source

#### Risk 2: Established Competitors Enter Market

**Description:**
ESRI, Trimble, or other GIS giants add similar features to their platforms.

**Likelihood:** Medium
**Impact:** High

**Mitigation strategies:**
1. **Speed to market:** Launch quickly and build network effects
2. **Forestry-first focus:** Deep domain expertise, not a feature add-on
3. **Superior UX:** Easier to use than complex GIS tools
4. **Lock-in through integrations:** API partnerships with forest planning tools
5. **Customer relationships:** Build trust and loyalty through excellent support

**Monitoring:**
- Track competitor product announcements
- Monitor competitor pricing
- Conduct competitive analysis quarterly
- Measure win/loss reasons in sales

#### Risk 3: Carbon Credit Market Slowdown

**Description:**
If carbon credit prices drop or regulations change, demand for verification may decrease.

**Likelihood:** Medium
**Impact:** Medium

**Mitigation strategies:**
1. **Diversify use cases:** Position as general forest inventory tool, not just carbon
2. **Multiple carbon standards:** Support VCS, CAR, ACR (don't rely on one)
3. **International expansion:** Different markets mature at different times
4. **Broader value:** Timber valuation, harvest planning, legal documentation

**Monitoring:**
- Track carbon credit prices (Verra VCS registry)
- Monitor policy changes (state/federal carbon programs)
- Survey customers on primary use case
- Measure revenue mix (carbon vs. other use cases)

### Technical Risks

#### Risk 4: Algorithm Accuracy Falls Short

**Description:**
If tree detection or species classification accuracy is poor, customers won't trust the platform.

**Likelihood:** Low
**Impact:** Very High

**Mitigation strategies:**
1. **Conservative claims:** Don't overpromise accuracy in marketing
2. **Transparent methodology:** Document limitations and confidence intervals
3. **User validation:** Allow users to correct errors, improve models
4. **Professional review:** Encourage field verification for high-stakes uses
5. **Regional models:** Optimize for specific forest types and regions

**Monitoring:**
- Validation against field plots (quarterly)
- User-reported accuracy issues
- Accuracy by forest type and region
- NPS question: "Do you trust the results?"

#### Risk 5: Data Security Breach

**Description:**
Customer data is compromised due to security vulnerability.

**Likelihood:** Low
**Impact:** Critical

**Mitigation strategies:**
1. **Security-first architecture:** Encryption, access controls, audit logs
2. **Regular security audits:** Quarterly penetration testing
3. **Compliance certifications:** SOC 2, ISO 27001
4. **Incident response plan:** Documented procedures for breach detection and response
5. **Insurance:** Cyber liability insurance

**Monitoring:**
- Automated security scanning (daily)
- Failed login attempts and anomaly detection
- Quarterly security audits
- Employee security training

#### Risk 6: Platform Downtime

**Description:**
Service outage prevents customers from accessing data or processing analyses.

**Likelihood:** Medium
**Impact:** High

**Mitigation strategies:**
1. **High availability architecture:** Redundant servers, auto-failover
2. **99.5% SLA:** Contractual commitment with credits for downtime
3. **Monitoring and alerts:** Immediate notification of issues
4. **Incident response:** On-call engineer rotation
5. **Status page:** Transparent communication during outages

**Monitoring:**
- Uptime monitoring (Pingdom, Datadog)
- Monthly uptime reports
- Post-mortem analysis of incidents
- Customer satisfaction during outages

### Business Risks

#### Risk 7: Customer Acquisition Cost Too High

**Description:**
If CAC exceeds targets, unit economics break down and growth stalls.

**Likelihood:** Medium
**Impact:** High

**Mitigation strategies:**
1. **Optimize conversion funnel:** A/B testing, improve trial experience
2. **Expand organic channels:** Content marketing, SEO, referrals
3. **Focus on retention:** Reduce churn to increase LTV
4. **Vertical focus:** Target highest-ROI customer segments
5. **Product-led growth:** Free tier to drive organic adoption

**Monitoring:**
- CAC by channel (monthly)
- Conversion rates at each funnel stage
- LTV/CAC ratio trending
- Experiment results (A/B tests)

#### Risk 8: Key Employee Departure

**Description:**
Loss of critical team member (founder, lead engineer) disrupts product development.

**Likelihood:** Medium
**Impact:** High

**Mitigation strategies:**
1. **Documentation:** Knowledge sharing, no single points of failure
2. **Cross-training:** Multiple people can handle critical functions
3. **Retention incentives:** Equity, performance bonuses, growth opportunities
4. **Succession planning:** Identify potential replacements
5. **Contractor network:** Relationships with contractors for surge capacity

**Monitoring:**
- Employee satisfaction surveys (quarterly)
- 1-on-1 check-ins with key employees
- Bus factor analysis: "What if X left tomorrow?"

---

## Regulatory Compliance & Standards

### Forestry Standards

#### USFS Forest Inventory and Analysis (FIA)

**What it is:**
National forest inventory program with standardized measurement protocols.

**Why it matters:**
- Industry-standard terminology and methods
- Required for federal reporting and grants
- Foresters expect FIA-compliant reports

**Our compliance:**
- Species codes match FIA species codes
- Measurements in FIA standard units (cm, m, m²/ha)
- Plot design options (fixed-radius, variable-radius)
- Core data items captured (species, DBH, height, status)
- Export format compatible with FIA database

**Validation:**
- Beta testing with FIA foresters
- Comparison of outputs with FIA plot data
- Annual review of FIA standards updates

#### Forest Resource Inventory (FRI) Protocols

**What it is:**
State-level forest inventory standards (varies by state).

**Why it matters:**
- Required for state forest management plans
- Timber harvest permitting
- State grant programs

**Our compliance:**
- Support multiple state standards (OR, WA, CA, ME, etc.)
- Configurable report templates
- State-specific species codes and units

### Carbon Credit Standards

#### Verified Carbon Standard (VCS)

**What it is:**
Leading voluntary carbon credit standard (managed by Verra).

**Why it matters:**
- 60%+ of voluntary carbon market uses VCS
- LiDAR increasingly accepted for monitoring
- Rigorous methodology requirements

**Our compliance:**
- Above-ground biomass equations match VCS methodologies
- Uncertainty quantification and confidence intervals
- Audit trail for all calculations
- Documentation of data sources and methods
- Support for VCS project types: IFM, AC, A/R

**Validation:**
- Review by VCS-approved validators
- Case studies with active carbon projects
- Annual methodology updates

#### Climate Action Reserve (CAR)

**What it is:**
North American carbon credit standard.

**Why it matters:**
- Accepted in California cap-and-trade program
- Strong in Western US forestry projects
- Specific LiDAR protocols

**Our compliance:**
- CAR Forest Project Protocol v5.0 compatibility
- Plot-based sampling requirements
- Additionality and leakage calculations
- Reporting templates

#### American Carbon Registry (ACR)

**What it is:**
First private voluntary carbon offset program in US.

**Why it matters:**
- Alternative to VCS for some project types
- Accepts remote sensing methods
- Growing in adoption

**Our compliance:**
- ACR methodology compatibility
- Forest carbon inventory protocols
- Reporting and verification support

### Data Privacy & Security

#### GDPR (General Data Protection Regulation)

**What it is:**
EU data privacy law.

**Why it matters:**
- Required if we have EU customers
- Best practice for data privacy globally
- Builds customer trust

**Our compliance:**
- Data minimization (only collect necessary data)
- User consent for data processing
- Right to access and delete data
- Data breach notification (72 hours)
- Privacy policy and terms of service

#### CCPA (California Consumer Privacy Act)

**What it is:**
California data privacy law.

**Why it matters:**
- Required for California customers
- Model for other state privacy laws
- Consumer rights to data

**Our compliance:**
- Disclosure of data collection practices
- Opt-out of data sales (we don't sell data)
- Right to delete data
- Non-discrimination for privacy rights

### Accessibility

#### WCAG 2.1 Level AA

**What it is:**
Web Content Accessibility Guidelines for users with disabilities.

**Why it matters:**
- Required for government contracts
- Legal requirement (ADA, Section 508)
- Inclusive design for all users
- 15% of population has some disability

**Our compliance:**
- Keyboard navigation for all features
- Screen reader compatibility
- Color contrast ratios (4.5:1 minimum)
- Alternative text for images and visualizations
- Captions for videos
- Regular accessibility audits

### Security & Compliance Certifications

#### SOC 2 Type II

**What it is:**
Security, availability, and confidentiality audit.

**Why it matters:**
- Required by enterprise customers
- Validates security controls
- Trust and credibility

**Timeline:**
- Year 1: SOC 2 Type I (point-in-time)
- Year 2: SOC 2 Type II (6-month audit period)

#### ISO 27001

**What it is:**
Information security management system standard.

**Why it matters:**
- International standard
- Required for some government contracts
- Demonstrates security maturity

**Timeline:**
- Year 2-3: ISO 27001 certification

---

## Frequently Asked Questions

### Product Questions

**Q: Can I use the platform without LiDAR data?**
A: No, LiDAR point cloud data is required for analysis. However, we can help you find free public LiDAR data (USGS, state agencies) or connect you with drone service providers for custom surveys.

**Q: What file formats do you support?**
A: We support LAS and LAZ files (ASPRS standard LiDAR formats). Most LiDAR data providers deliver in these formats.

**Q: How accurate is the tree detection?**
A: Accuracy varies by forest type and LiDAR quality, but typically 90%+ detection for trees >15cm DBH. We provide accuracy estimates and encourage field validation for high-stakes uses.

**Q: Can I customize species models for my region?**
A: Currently we support pre-built species models for major regions (Pacific Northwest, Southeast US, etc.). Custom models are available for Enterprise customers with sufficient training data.

**Q: Do you offer field data collection tools?**
A: Not yet—our platform currently focuses on LiDAR analysis. Mobile field app is on the Year 3 roadmap.

**Q: Can I integrate with my existing forest planning software?**
A: Yes, we offer API access (Business tier and above) and export to standard formats (Shapefile, Excel, GeoJSON) that work with most forest planning software.

### Business Questions

**Q: What is the minimum commitment?**
A: Pay-as-you-go tier has no commitment. Professional and Business tiers are month-to-month (or annual for discount). Enterprise contracts typically 1-year minimum.

**Q: Do you offer discounts for annual payment?**
A: Yes, annual payment saves ~17% compared to month-to-month.

**Q: What if I exceed my analysis limit?**
A: You'll receive a notification and can either upgrade to the next tier or purchase additional analyses à la carte.

**Q: Do you offer refunds?**
A: 30-day money-back guarantee if you're not satisfied (annual plans). Month-to-month can cancel anytime, no refund for partial month.

**Q: Can I get a demo before purchasing?**
A: Absolutely! We offer live demos and free trials. Contact sales@lidarforestry.com.

### Technical Questions

**Q: Do I need to install any software?**
A: No, the platform is entirely cloud-based. Works in any modern web browser (Chrome, Firefox, Safari, Edge).

**Q: How long does processing take?**
A: Typically <5 minutes for 100-hectare analysis. Processing time increases with file size, but rarely exceeds 15 minutes.

**Q: How do you ensure data security?**
A: Bank-level encryption (AES-256), secure cloud infrastructure (AWS), access controls, regular security audits. See Security section for details.

**Q: What happens to my data if I cancel?**
A: You have 30 days to export your data after cancellation. After 30 days, data is permanently deleted.

**Q: Can I download my raw LiDAR files?**
A: Yes, you can download original uploaded files and processed results at any time.

**Q: What is your uptime guarantee?**
A: 99.5% uptime SLA for Business and Enterprise tiers. Status page: status.lidarforestry.com.

### Forestry Questions

**Q: Is this accepted for carbon credit verification?**
A: LiDAR-based methods are increasingly accepted by VCS, CAR, and ACR. However, we recommend working with a VCS-approved validator who will review our outputs. We provide documentation and audit trails to support verification.

**Q: Can I use this for timber cruising/harvest planning?**
A: Yes! Our inventory reports include volume estimates and tree lists suitable for harvest planning. However, we recommend ground verification before finalizing harvest plans.

**Q: Does this replace field work entirely?**
A: No—LiDAR analysis is a powerful tool, but field work is still valuable for ground-truthing, assessing non-measurable factors (insect damage, decay, understory), and professional judgment.

**Q: What if my forest has complex topography?**
A: LiDAR excels in complex terrain where field work is difficult. Ensure good LiDAR coverage (no data gaps) and consider higher point density for steep slopes.

**Q: Can I analyze multi-layered forests?**
A: Our current algorithms focus on dominant/co-dominant canopy trees. Understory detection is on the roadmap but not yet available.

---

## Next Steps

### For Product Owners

1. **Review this guide** with your technical team to align on vision and roadmap
2. **Join a product demo** to see the platform in action
3. **Connect with beta testers** to understand their workflows and pain points
4. **Prioritize features** using the framework in this guide
5. **Schedule weekly syncs** with your engineering team

### For Founders

1. **Validate market opportunity** through customer interviews (we can help!)
2. **Review financial projections** and adjust based on your go-to-market strategy
3. **Secure funding** if needed (pre-seed, seed, grants)
4. **Build your team** (engineers, sales, marketing)
5. **Launch beta program** to validate product-market fit

### Resources

**Documents:**
- Technical Specifications: `.claude/agents/subagent-specifications.md`
- User Guides: `docs/user-guides/` (coming soon)
- API Documentation: `docs/api/` (coming soon)

**External Resources:**
- USFS FIA Program: https://www.fia.fs.usda.gov/
- Verra VCS: https://verra.org/programs/verified-carbon-standard/
- SAF: https://www.eforester.org/
- ACF: https://www.acf-foresters.org/

**Contact:**
- Product questions: product@lidarforestry.com
- Technical support: support@lidarforestry.com
- Sales inquiries: sales@lidarforestry.com

---

**Thank you for reading this guide!**

This platform has the potential to transform how forestry professionals manage and monitor forests. With your domain expertise and passion for forestry combined with modern technology, we can deliver immense value to the forest industry while advancing sustainable forest management.

Let's build something great together!

---

**Version History:**
- 1.0 (2025-10-30): Initial Product Owner & Founder Guide

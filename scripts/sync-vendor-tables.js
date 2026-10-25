'use strict';

require('dotenv').config();
const { db } = require('../src/database/client');

async function syncVendorTables() {
  try {
    console.log('Connecting to database...');
    await db.sequelize.authenticate();
    console.log('✅ Connected.');

    console.log('Syncing Vendor, VendorRateCard, and VendorPerformance models...');
    await db.Vendor.sync({ alter: true });
    console.log('✅ vendors table synced.');

    await db.VendorRateCard.sync({ alter: true });
    console.log('✅ vendor_rate_cards table synced.');

    await db.VendorPerformance.sync({ alter: true });
    console.log('✅ vendor_performances table synced.');

    // Check count and seed demo vendors if empty
    const count = await db.Vendor.count();
    if (count === 0) {
      console.log('Seeding initial vendors...');
      const admin = await db.User.findOne();
      const adminId = admin ? admin.id : null;

      const v1 = await db.Vendor.create({
        vendorCode: 'FL-2026-001',
        name: 'Aarav Sharma (MotionCraft)',
        type: 'FREELANCER',
        status: 'ACTIVE',
        primaryContactName: 'Aarav Sharma',
        email: 'aarav.motion@gmail.com',
        phone: '+91 98765 43210',
        whatsappNumber: '+91 98765 43210',
        skills: ['After Effects', 'Premiere Pro', '3D Motion', 'Color Grading'],
        serviceCategory: 'Video & Animation',
        location: 'Mumbai, Maharashtra',
        portfolioUrl: 'https://behance.net/aaravmotion',
        panNumber: 'ABCPS1234F',
        bankName: 'HDFC Bank',
        bankAccountNumber: '50100234567890',
        bankIfscSwift: 'HDFC0001234',
        paymentTerms: 'NET_15',
        currency: 'INR',
        rating: 4.8,
        totalRatingsCount: 3,
        notes: 'Top-tier motion graphics and short video specialist. Rapid turnaround.',
        createdById: adminId,
      });

      const v2 = await db.Vendor.create({
        vendorCode: 'AGY-2026-002',
        name: 'PixelForge Studios LLP',
        type: 'PARTNER_AGENCY',
        status: 'ACTIVE',
        primaryContactName: 'Priya Mehra',
        email: 'partnerships@pixelforge.io',
        phone: '+91 91234 56780',
        whatsappNumber: '+91 91234 56780',
        skills: ['Custom Web Dev', 'React', 'Next.js', 'Node.js', 'UI/UX Design'],
        serviceCategory: 'Technology & Design',
        location: 'Bengaluru, Karnataka',
        website: 'https://pixelforge.io',
        gstNumber: '29ABCDE1234F1Z5',
        bankName: 'ICICI Bank',
        bankAccountNumber: '000205001234',
        bankIfscSwift: 'ICIC0000002',
        paymentTerms: 'NET_30',
        currency: 'INR',
        rating: 4.6,
        totalRatingsCount: 2,
        notes: 'Reliable engineering partner for complex web deliverables and microsites.',
        createdById: adminId,
      });

      const v3 = await db.Vendor.create({
        vendorCode: 'VND-2026-003',
        name: 'Vibrant Print & Media Works',
        type: 'VENDOR',
        status: 'ACTIVE',
        primaryContactName: 'Karan Patel',
        email: 'orders@vibrantprint.in',
        phone: '+91 99887 76655',
        whatsappNumber: '+91 99887 76655',
        skills: ['Offset Printing', 'Large Format Banners', 'Brand Merch', 'Packaging Boxes'],
        serviceCategory: 'Printing & Packaging',
        location: 'Ahmedabad, Gujarat',
        gstNumber: '24AABCV5678K1Z9',
        bankName: 'State Bank of India',
        bankAccountNumber: '30291827364',
        bankIfscSwift: 'SBIN0004321',
        paymentTerms: 'UPON_DELIVERY',
        currency: 'INR',
        rating: 4.9,
        totalRatingsCount: 4,
        notes: 'Primary printing supplier for packaging, signage, and marketing collaterals.',
        createdById: adminId,
      });

      console.log('Seeding initial rate cards...');
      await db.VendorRateCard.bulkCreate([
        {
          vendorId: v1.id,
          serviceTitle: '30-60s Viral Social Reel Editing',
          category: 'Video',
          pricingModel: 'PER_UNIT',
          baseRate: 2500.00,
          currency: 'INR',
          minTurnaroundTime: '24 Hours',
          description: 'Includes sound design, dynamic captions, zooms, SFX and 2 revision rounds.',
          isActive: true,
          createdById: adminId,
        },
        {
          vendorId: v1.id,
          serviceTitle: 'Full YouTube Explainer Video (8-12 mins)',
          category: 'Video',
          pricingModel: 'PER_UNIT',
          baseRate: 8500.00,
          currency: 'INR',
          minTurnaroundTime: '4 Business Days',
          description: 'A-roll cutting, B-roll sourcing, custom motion titles, audio sweetening.',
          isActive: true,
          createdById: adminId,
        },
        {
          vendorId: v2.id,
          serviceTitle: 'Landing Page UI/UX Design (Figma)',
          category: 'Design',
          pricingModel: 'PER_PROJECT',
          baseRate: 22000.00,
          currency: 'INR',
          minTurnaroundTime: '5 Days',
          description: 'High-fidelity Figma wireframes, responsive mobile views, interactive prototype.',
          isActive: true,
          createdById: adminId,
        },
        {
          vendorId: v2.id,
          serviceTitle: 'Dedicated Senior Fullstack Developer',
          category: 'Technology',
          pricingModel: 'PER_MONTH',
          baseRate: 95000.00,
          currency: 'INR',
          minTurnaroundTime: 'Monthly Retainer',
          description: 'Full-time outsourced engineer dedicated to web applications and API pipelines.',
          isActive: true,
          createdById: adminId,
        },
        {
          vendorId: v3.id,
          serviceTitle: 'Matte Laminated Standee (6x3 ft)',
          category: 'Print',
          pricingModel: 'PER_UNIT',
          baseRate: 1450.00,
          currency: 'INR',
          minTurnaroundTime: '48 Hours',
          description: 'High resolution digital print on star flex with aluminum standee mechanism.',
          isActive: true,
          createdById: adminId,
        },
      ]);

      console.log('Seeding initial performance records...');
      await db.VendorPerformance.bulkCreate([
        {
          vendorId: v1.id,
          reviewTitle: 'Q3 Product Launch Reels Series Delivery',
          deliveryTimeline: 'EARLY',
          qualityRating: 5,
          timelinessRating: 5,
          communicationRating: 4,
          costRating: 5,
          overallScore: 4.8,
          plannedDays: 3,
          actualDays: 2,
          costAdherence: 'WITHIN_BUDGET',
          billedAmount: 7500.00,
          feedback: 'Outstanding delivery ahead of deadline. Very responsive to brief and creative with pacing.',
          reviewedById: adminId,
        },
        {
          vendorId: v2.id,
          reviewTitle: 'Client Portal Interactive Frontend Prototype',
          deliveryTimeline: 'ON_TIME',
          qualityRating: 5,
          timelinessRating: 4,
          communicationRating: 5,
          costRating: 4,
          overallScore: 4.5,
          plannedDays: 7,
          actualDays: 7,
          costAdherence: 'WITHIN_BUDGET',
          billedAmount: 22000.00,
          feedback: 'High aesthetic quality and clean code structure. Great collaborative team.',
          reviewedById: adminId,
        },
      ]);

      console.log('✅ Demo vendor data seeded successfully.');
    }

    console.log('All vendor tables synced and ready.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Sync failed:', err);
    process.exit(1);
  }
}

syncVendorTables();

'use strict';

/**
 * Vendor — Master record for Vendors, Freelancers, Collaborators, and Partner Agencies.
 *
 * type:
 *   VENDOR          — Supplier / Service Vendor
 *   FREELANCER      — Individual Freelance Specialist
 *   COLLABORATOR    — Strategic Industry Collaborator
 *   PARTNER_AGENCY  — External Specialized Partner Agency
 *
 * status:
 *   ACTIVE          — Readily available for assignments
 *   ON_HOLD         — Temporarily paused
 *   INACTIVE        — Not actively engaged
 *   BLACKLISTED     — Disqualified due to compliance or performance
 */
module.exports = (sequelize, DataTypes) => {
  const Vendor = sequelize.define('Vendor', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    vendorCode: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
      field: 'vendor_code',
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    type: {
      type: DataTypes.ENUM('VENDOR', 'FREELANCER', 'COLLABORATOR', 'PARTNER_AGENCY'),
      allowNull: false,
      defaultValue: 'FREELANCER',
    },
    status: {
      type: DataTypes.ENUM('ACTIVE', 'ON_HOLD', 'INACTIVE', 'BLACKLISTED'),
      allowNull: false,
      defaultValue: 'ACTIVE',
    },
    primaryContactName: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'primary_contact_name',
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: true,
      validate: { isEmail: true },
    },
    phone: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    whatsappNumber: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'whatsapp_number',
    },
    skills: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'Array of skill tags, e.g. ["Video Editing", "3D Motion", "Copywriting"]',
      get() {
        const val = this.getDataValue('skills');
        if (!val) return [];
        if (typeof val === 'string') {
          try {
            const parsed = JSON.parse(val);
            return Array.isArray(parsed) ? parsed : [val];
          } catch {
            return val.split(',').map((s) => s.trim()).filter(Boolean);
          }
        }
        return Array.isArray(val) ? val : [];
      },
      set(val) {
        if (Array.isArray(val)) {
          this.setDataValue('skills', val);
        } else if (typeof val === 'string') {
          try {
            const parsed = JSON.parse(val);
            this.setDataValue('skills', Array.isArray(parsed) ? parsed : [val]);
          } catch {
            this.setDataValue('skills', val.split(',').map((s) => s.trim()).filter(Boolean));
          }
        } else {
          this.setDataValue('skills', []);
        }
      },
    },
    serviceCategory: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'service_category',
      comment: 'e.g. Creative, Tech, Operations, Media Production',
    },
    location: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    website: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    portfolioUrl: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: 'portfolio_url',
    },
    gstNumber: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'gst_number',
    },
    panNumber: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'pan_number',
    },
    bankName: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'bank_name',
    },
    bankAccountNumber: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'bank_account_number',
    },
    bankIfscSwift: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'bank_ifsc_swift',
    },
    paymentTerms: {
      type: DataTypes.STRING(100),
      allowNull: true,
      defaultValue: 'UPON_DELIVERY',
      field: 'payment_terms',
      comment: 'e.g. NET_15, NET_30, UPON_DELIVERY, ADVANCE_50',
    },
    currency: {
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: 'INR',
    },
    rating: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 5.0,
      comment: 'Aggregated reliability rating 0.0 - 5.0',
    },
    totalRatingsCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'total_ratings_count',
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    createdById: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'created_by_id',
      references: { model: 'users', key: 'id' },
    },
    deletedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'deleted_at',
    },
  }, {
    tableName: 'vendors',
    timestamps: true,
    paranoid: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    deletedAt: 'deleted_at',
  });

  Vendor.associate = (models) => {
    Vendor.hasMany(models.VendorRateCard, {
      as: 'rateCards',
      foreignKey: 'vendorId',
    });

    Vendor.hasMany(models.VendorPerformance, {
      as: 'performanceRecords',
      foreignKey: 'vendorId',
    });

    Vendor.belongsTo(models.User, {
      as: 'creator',
      foreignKey: 'createdById',
    });
  };

  return Vendor;
};

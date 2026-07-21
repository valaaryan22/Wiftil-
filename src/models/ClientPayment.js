'use strict';

/**
 * ClientPayment — Tracks every financial transaction / collection event for a client.
 *
 * paymentType:
 *   INVOICE        — A formal invoice raised against the client (initial record, status=PENDING)
 *   PAYMENT        — A payment received from the client (can be against an invoice or standalone)
 *   ADVANCE        — Advance deposit received before services start
 *   CREDIT_NOTE    — Credit issued to the client (negative outstanding)
 *   REFUND         — Money returned to the client
 *   WRITE_OFF      — Uncollectable amount written off
 *   ADJUSTMENT     — Manual balance correction
 *
 * status:
 *   DRAFT          — Invoice being prepared (not yet sent)
 *   SENT           — Invoice sent to client (awaiting payment)
 *   PARTIALLY_PAID — Partial amount received
 *   PAID           — Fully settled
 *   OVERDUE        — Past due date without full payment
 *   DISPUTED       — Client has raised a dispute
 *   CANCELLED      — Invoice/payment cancelled before collection
 *   REFUNDED       — Payment refunded to client
 *   WRITTEN_OFF    — Marked as uncollectable
 *
 * paymentMode:
 *   BANK_TRANSFER | UPI | CHEQUE | CASH | CARD | NEFT | RTGS | IMPS | OTHER
 */
module.exports = (sequelize, DataTypes) => {
  const ClientPayment = sequelize.define('ClientPayment', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },

    // ── Foreign Keys ─────────────────────────────────────────────────────────
    clientId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'client_id',
      references: { model: 'clients', key: 'id' },
      comment: 'The client this payment belongs to',
    },
    packageId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'package_id',
      references: { model: 'client_packages', key: 'id' },
      comment: 'Optional link to the package this invoice / payment is for',
    },
    /**
     * For PAYMENT records — points to the parent INVOICE being settled.
     * Self-referential FK inside client_payments table.
     */
    parentInvoiceId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'parent_invoice_id',
      comment: 'FK to the invoice this payment is settling (self-referential)',
    },
    createdById: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'created_by_id',
      references: { model: 'users', key: 'id' },
    },
    collectedById: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'collected_by_id',
      references: { model: 'users', key: 'id' },
      comment: 'Team member who physically collected / confirmed the payment',
    },
    approvedById: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'approved_by_id',
      references: { model: 'users', key: 'id' },
      comment: 'Manager who approved / verified this payment record',
    },

    // ── Invoice / Record Identifiers ─────────────────────────────────────────
    invoiceNumber: {
      type: DataTypes.STRING(100),
      allowNull: true,
      unique: true,
      field: 'invoice_number',
      comment: 'Human-readable invoice / reference number e.g. INV-202507-001',
    },
    referenceNumber: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'reference_number',
      comment: 'Bank reference / UTR / cheque number / transaction ID',
    },

    // ── Classification ────────────────────────────────────────────────────────
    paymentType: {
      type: DataTypes.ENUM(
        'INVOICE', 'PAYMENT', 'ADVANCE', 'CREDIT_NOTE',
        'REFUND', 'WRITE_OFF', 'ADJUSTMENT'
      ),
      allowNull: false,
      defaultValue: 'INVOICE',
      field: 'payment_type',
    },
    status: {
      type: DataTypes.ENUM(
        'DRAFT', 'SENT', 'PARTIALLY_PAID', 'PAID',
        'OVERDUE', 'DISPUTED', 'CANCELLED', 'REFUNDED', 'WRITTEN_OFF'
      ),
      allowNull: false,
      defaultValue: 'DRAFT',
    },
    paymentMode: {
      type: DataTypes.ENUM(
        'BANK_TRANSFER', 'UPI', 'CHEQUE', 'CASH',
        'CARD', 'NEFT', 'RTGS', 'IMPS', 'OTHER'
      ),
      allowNull: true,
      field: 'payment_mode',
      comment: 'Applicable for PAYMENT / ADVANCE / REFUND records',
    },

    // ── Amounts ───────────────────────────────────────────────────────────────
    currency: {
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: 'INR',
    },
    amount: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0,
      comment: 'Gross invoice/payment amount (before tax)',
    },
    taxAmount: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0,
      field: 'tax_amount',
      comment: 'GST / tax amount on top of base amount',
    },
    taxRate: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
      field: 'tax_rate',
      comment: 'Tax percentage applied e.g. 18.00 for 18% GST',
    },
    totalAmount: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0,
      field: 'total_amount',
      comment: 'amount + taxAmount (auto-computable but stored for quick queries)',
    },
    paidAmount: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0,
      field: 'paid_amount',
      comment: 'Amount received so far (cumulative across linked PAYMENT records)',
    },
    balanceAmount: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0,
      field: 'balance_amount',
      comment: 'Remaining amount due = totalAmount - paidAmount',
    },
    discountAmount: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0,
      field: 'discount_amount',
      comment: 'Any discount applied on the invoice',
    },
    penaltyAmount: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0,
      field: 'penalty_amount',
      comment: 'Late payment penalty / interest charged',
    },

    // ── Dates ─────────────────────────────────────────────────────────────────
    invoiceDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'invoice_date',
      comment: 'Date invoice was generated / raised',
    },
    dueDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'due_date',
      comment: 'Payment due date',
    },
    paidDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'paid_date',
      comment: 'Actual date payment was received / confirmed',
    },
    sentAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'sent_at',
      comment: 'Timestamp when invoice was sent to client',
    },
    approvedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'approved_at',
      comment: 'Timestamp when the payment was approved / verified',
    },

    // ── Dispute / Follow-up ───────────────────────────────────────────────────
    disputeReason: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'dispute_reason',
      comment: 'Client\'s stated reason for dispute',
    },
    disputeRaisedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'dispute_raised_at',
    },
    disputeResolvedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'dispute_resolved_at',
    },
    nextFollowUpDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'next_follow_up_date',
      comment: 'Scheduled date for next collection follow-up',
    },
    followUpCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'follow_up_count',
      comment: 'Number of follow-up reminders sent',
    },

    // ── Metadata / Notes ──────────────────────────────────────────────────────
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Invoice line item description or payment remarks',
    },
    internalNotes: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'internal_notes',
      comment: 'Private notes visible only to team',
    },
    /**
     * Structured line items for the invoice.
     * Example:
     * [
     *   { description: "Monthly Retainer – July 2026", quantity: 1, unitPrice: 50000, amount: 50000 },
     *   { description: "Paid Social Add-On", quantity: 1, unitPrice: 15000, amount: 15000 }
     * ]
     */
    lineItems: {
      type: DataTypes.JSON,
      allowNull: true,
      field: 'line_items',
      comment: 'JSON array of invoice line items',
    },
    /**
     * Attachment references (not cloud-stored; mirrors ClientDocument pattern).
     * Example: [{ fileName: "invoice.pdf", filePath: "/docs/inv-001.pdf" }]
     */
    attachments: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'Array of attachment references { fileName, filePath }',
    },

    deletedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'deleted_at',
    },
  }, {
    tableName: 'client_payments',
    timestamps: true,
    paranoid: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    deletedAt: 'deleted_at',
    indexes: [
      { fields: ['client_id'] },
      { fields: ['package_id'] },
      { fields: ['parent_invoice_id'] },
      { fields: ['status'] },
      { fields: ['payment_type'] },
      { fields: ['due_date'] },
    ],
    hooks: {
      /**
       * Auto-generate invoice number for INVOICE type records if not provided.
       * Format: INV-YYYYMM-XXXX (e.g. INV-202507-A3F9)
       */
      beforeValidate: (payment) => {
        if (payment.paymentType === 'INVOICE' && !payment.invoiceNumber) {
          const ym = new Date().toISOString().slice(0, 7).replace('-', '');
          const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
          payment.invoiceNumber = `INV-${ym}-${rand}`;
        }
        // Auto-compute totalAmount
        const base    = parseFloat(payment.amount     || 0);
        const tax     = parseFloat(payment.taxAmount  || 0);
        const disc    = parseFloat(payment.discountAmount || 0);
        const penalty = parseFloat(payment.penaltyAmount  || 0);
        payment.totalAmount   = parseFloat((base + tax - disc + penalty).toFixed(2));
        payment.balanceAmount = parseFloat((payment.totalAmount - parseFloat(payment.paidAmount || 0)).toFixed(2));
      },
    },
  });

  ClientPayment.associate = function (models) {
    ClientPayment.belongsTo(models.Client, {
      foreignKey: 'client_id',
      as: 'client',
    });
    ClientPayment.belongsTo(models.ClientPackage, {
      foreignKey: 'package_id',
      as: 'package',
    });
    // Self-referential: payment → invoice
    ClientPayment.belongsTo(models.ClientPayment, {
      foreignKey: 'parent_invoice_id',
      as: 'parentInvoice',
    });
    ClientPayment.hasMany(models.ClientPayment, {
      foreignKey: 'parent_invoice_id',
      as: 'paymentEntries',
    });
    ClientPayment.belongsTo(models.User, {
      foreignKey: 'created_by_id',
      as: 'createdBy',
    });
    ClientPayment.belongsTo(models.User, {
      foreignKey: 'collected_by_id',
      as: 'collectedBy',
    });
    ClientPayment.belongsTo(models.User, {
      foreignKey: 'approved_by_id',
      as: 'approvedBy',
    });
  };

  return ClientPayment;
};

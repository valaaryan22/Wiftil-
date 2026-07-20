'use strict';

/**
 * DocketTicket — A ticket inside a ticket-based Docket.
 *
 * ticketType: SERVICE_DELIVERY | ADD_ON_REQUEST | BUG | CHANGE_REQUEST | APPROVAL
 * priority:   LOW | MEDIUM | HIGH | CRITICAL
 * status:     OPEN | IN_PROGRESS | PENDING_APPROVAL | RESOLVED | CLOSED | REJECTED
 *
 * ticketCode is auto-generated: TKT-YYYYMMDD-XXXX
 *
 * A ticket can optionally link to:
 *  - an existing Task (taskId)         → when work is routed to the task system
 *  - a PackageAddOn (addOnId)          → when this ticket is for an add-on request
 *  - a ServiceCatalog entry (serviceId) → which service this ticket covers
 */
module.exports = (sequelize, DataTypes) => {
  const DocketTicket = sequelize.define('DocketTicket', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    ticketCode: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
      field: 'ticket_code',
    },
    docketId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'docket_id',
      references: { model: 'dockets', key: 'id' },
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    ticketType: {
      type: DataTypes.ENUM('SERVICE_DELIVERY', 'ADD_ON_REQUEST', 'BUG', 'CHANGE_REQUEST', 'APPROVAL'),
      allowNull: false,
      defaultValue: 'SERVICE_DELIVERY',
      field: 'ticket_type',
    },
    priority: {
      type: DataTypes.ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'),
      allowNull: false,
      defaultValue: 'MEDIUM',
    },
    status: {
      type: DataTypes.ENUM('OPEN', 'IN_PROGRESS', 'PENDING_APPROVAL', 'RESOLVED', 'CLOSED', 'REJECTED'),
      allowNull: false,
      defaultValue: 'OPEN',
    },
    taskId: {
      // Link to existing Task if work is tracked via the task system
      type: DataTypes.UUID,
      allowNull: true,
      field: 'task_id',
      references: { model: 'tasks', key: 'id' },
    },
    addOnId: {
      // Link to PackageAddOn if this ticket is for an add-on
      type: DataTypes.UUID,
      allowNull: true,
      field: 'add_on_id',
      references: { model: 'package_add_ons', key: 'id' },
    },
    serviceId: {
      // Which service catalog entry this ticket covers
      type: DataTypes.UUID,
      allowNull: true,
      field: 'service_id',
      references: { model: 'service_catalog', key: 'id' },
    },
    dueDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'due_date',
    },
    assignedToId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'assigned_to_id',
      references: { model: 'users', key: 'id' },
    },
    reportedById: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'reported_by_id',
      references: { model: 'users', key: 'id' },
    },
    resolvedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'resolved_at',
    },
    closedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'closed_at',
    },
    resolutionNote: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'resolution_note',
    },
  }, {
    tableName: 'docket_tickets',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { fields: ['docket_id'] },
      { fields: ['status'] },
      { fields: ['ticket_type'] },
      { fields: ['assigned_to_id'] },
    ],
    hooks: {
      beforeValidate: async (ticket) => {
        if (!ticket.ticketCode) {
          const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
          const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase();
          ticket.ticketCode = `TKT-${dateStr}-${randomStr}`;
        }
      },
    },
  });

  DocketTicket.associate = function (models) {
    DocketTicket.belongsTo(models.Docket, {
      foreignKey: 'docket_id',
      as: 'docket',
    });
    DocketTicket.belongsTo(models.Task, {
      foreignKey: 'task_id',
      as: 'task',
    });
    DocketTicket.belongsTo(models.PackageAddOn, {
      foreignKey: 'add_on_id',
      as: 'addOn',
    });
    DocketTicket.belongsTo(models.ServiceCatalog, {
      foreignKey: 'service_id',
      as: 'service',
    });
    DocketTicket.belongsTo(models.User, {
      foreignKey: 'assigned_to_id',
      as: 'assignedTo',
    });
    DocketTicket.belongsTo(models.User, {
      foreignKey: 'reported_by_id',
      as: 'reportedBy',
    });
  };

  return DocketTicket;
};

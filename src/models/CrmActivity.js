'use strict';

/**
 * CrmActivity — Follow-ups, Calls, Meetings, Reminders, and Actions.
 *
 * type:
 *   CALL, MEETING, FOLLOW_UP, EMAIL, REMINDER, TASK
 *
 * status:
 *   SCHEDULED, COMPLETED, CANCELLED, OVERDUE
 */
module.exports = (sequelize, DataTypes) => {
  const CrmActivity = sequelize.define('CrmActivity', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    type: {
      type: DataTypes.ENUM('CALL', 'MEETING', 'FOLLOW_UP', 'EMAIL', 'REMINDER', 'TASK'),
      allowNull: false,
      defaultValue: 'FOLLOW_UP',
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    scheduledAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'scheduled_at',
    },
    durationMinutes: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 30,
      field: 'duration_minutes',
    },
    status: {
      type: DataTypes.ENUM('SCHEDULED', 'COMPLETED', 'CANCELLED', 'OVERDUE'),
      allowNull: false,
      defaultValue: 'SCHEDULED',
    },
    priority: {
      type: DataTypes.ENUM('LOW', 'MEDIUM', 'HIGH'),
      allowNull: false,
      defaultValue: 'MEDIUM',
    },
    leadId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'lead_id',
      references: { model: 'crm_leads', key: 'id' },
    },
    dealId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'deal_id',
      references: { model: 'crm_deals', key: 'id' },
    },
    clientId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'client_id',
      references: { model: 'clients', key: 'id' },
    },
    assignedToId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'assigned_to_id',
      references: { model: 'users', key: 'id' },
    },
    outcomeNotes: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'outcome_notes',
    },
    nextFollowUpDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'next_follow_up_date',
    },
    meetingLink: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'meeting_link',
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
    tableName: 'crm_activities',
    timestamps: true,
    paranoid: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    deletedAt: 'deleted_at',
  });

  CrmActivity.associate = (models) => {
    CrmActivity.belongsTo(models.Lead, {
      as: 'lead',
      foreignKey: 'leadId',
    });

    CrmActivity.belongsTo(models.Deal, {
      as: 'deal',
      foreignKey: 'dealId',
    });

    CrmActivity.belongsTo(models.Client, {
      as: 'client',
      foreignKey: 'clientId',
    });

    CrmActivity.belongsTo(models.User, {
      as: 'assignedTo',
      foreignKey: 'assignedToId',
    });

    CrmActivity.belongsTo(models.User, {
      as: 'creator',
      foreignKey: 'createdById',
    });
  };

  return CrmActivity;
};

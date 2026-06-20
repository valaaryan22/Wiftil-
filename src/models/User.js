'use strict';

const bcrypt = require('bcryptjs');

module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define('User', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      validate: { isEmail: true },
    },
    password: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    firstName: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'first_name',
    },
    lastName: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'last_name',
    },
    roleId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'role_id',
      references: { model: 'role_definitions', key: 'id' },
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'is_active',
    },
    isEmailVerified: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_email_verified',
    },
    profilePicture: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'profile_picture',
    },
    phone: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },
    department: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    jobTitle: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'job_title',
    },
    managerId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'manager_id',
      references: { model: 'users', key: 'id' },
    },
    deletedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'deleted_at',
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'created_at',
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'updated_at',
    },
  }, {
    tableName: 'users',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { fields: ['role_id'] },
      { fields: ['manager_id'] },
    ],
    hooks: {
      beforeCreate: async (user) => {
        if (user.password) {
          const salt = await bcrypt.genSalt(parseInt(process.env.BCRYPT_ROUNDS) || 12);
          user.password = await bcrypt.hash(user.password, salt);
        }
      },
      beforeUpdate: async (user) => {
        if (user.changed('password') && user.password) {
          const salt = await bcrypt.genSalt(parseInt(process.env.BCRYPT_ROUNDS) || 12);
          user.password = await bcrypt.hash(user.password, salt);
        }
      },
    },
  });

  User.prototype.comparePassword = async function (candidatePassword) {
    if (!this.password) return false;
    return bcrypt.compare(candidatePassword, this.password);
  };

  User.associate = function (models) {
    User.belongsTo(models.RoleDefinition, {
      foreignKey: 'role_id',
      as: 'role',
    });
    User.belongsTo(models.User, {
      foreignKey: 'manager_id',
      as: 'manager',
    });
    User.hasMany(models.User, {
      foreignKey: 'manager_id',
      as: 'subordinates',
    });
    User.hasMany(models.Token, {
      foreignKey: 'user_id',
      as: 'tokens',
    });
    User.hasMany(models.LeaveRequest, {
      foreignKey: 'requester_id',
      as: 'leaveRequests',
    });
    User.hasMany(models.LeaveRequest, {
      foreignKey: 'reviewer_id',
      as: 'reviewedLeaves',
    });
    User.hasMany(models.AuditLog, {
      foreignKey: 'performed_by_id',
      as: 'auditLogs',
    });
    User.hasMany(models.AuditLog, {
      foreignKey: 'target_user_id',
      as: 'affectedLogs',
    });
    User.hasMany(models.Task, {
      foreignKey: 'created_by_id',
      as: 'createdTasks',
    });
    User.hasMany(models.Task, {
      foreignKey: 'manager_id',
      as: 'managedTasks',
    });
    User.hasMany(models.TaskAssignment, {
      foreignKey: 'team_lead_id',
      as: 'taskAssignments',
    });
    User.hasMany(models.TaskAssignment, {
      foreignKey: 'assigned_by_id',
      as: 'taskAssignedBy',
    });
    User.hasMany(models.SubTask, {
      foreignKey: 'created_by_id',
      as: 'createdSubTasks',
    });
    User.hasMany(models.SubTask, {
      foreignKey: 'reviewed_by_id',
      as: 'reviewedSubTasks',
    });
    User.hasMany(models.SubTaskAssignment, {
      foreignKey: 'member_id',
      as: 'subTaskAssignments',
    });
    User.hasMany(models.SubTaskAssignment, {
      foreignKey: 'assigned_by_id',
      as: 'subTaskAssignedBy',
    });
    User.hasMany(models.PerformanceRating, {
      foreignKey: 'rated_user_id',
      as: 'ratingsReceived',
    });
    User.hasMany(models.PerformanceRating, {
      foreignKey: 'rated_by_id',
      as: 'ratingsGiven',
    });
    User.hasMany(models.TaskComment, {
      foreignKey: 'author_id',
      as: 'taskComments',
    });
    User.hasMany(models.TaskAttachment, {
      foreignKey: 'uploaded_by_id',
      as: 'taskAttachments',
    });
    User.hasMany(models.Notification, {
      foreignKey: 'user_id',
      as: 'notifications',
    });
  };

  return User;
};

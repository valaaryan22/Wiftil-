'use strict';

module.exports = (sequelize, DataTypes) => {
  const TaskChain = sequelize.define('TaskChain', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    key: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
      validate: {
        notEmpty: true,
      },
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    category: {
      type: DataTypes.STRING(100),
      allowNull: false,
      defaultValue: 'General',
    },
    tasks: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
      comment: 'Array of predefined task items: [{ title, description, priority, estimatedHours, order, dependsOnIndex }]',
      get() {
        const val = this.getDataValue('tasks');
        if (typeof val === 'string') {
          try {
            return JSON.parse(val);
          } catch (e) {
            return [];
          }
        }
        return Array.isArray(val) ? val : [];
      },
      set(val) {
        if (typeof val === 'string') {
          try {
            this.setDataValue('tasks', JSON.parse(val));
          } catch (e) {
            this.setDataValue('tasks', []);
          }
        } else {
          this.setDataValue('tasks', val || []);
        }
      },
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'is_active',
    },
    createdById: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'created_by_id',
      references: { model: 'users', key: 'id' },
    },
  }, {
    tableName: 'task_chains',
    underscored: true,
    timestamps: true,
  });

  TaskChain.associate = (models) => {
    TaskChain.belongsTo(models.User, { foreignKey: 'createdById', as: 'createdBy' });
  };

  return TaskChain;
};

'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Extend notification ENUM with date-change types
    await queryInterface.sequelize.query(ALTER TABLE notifications MODIFY COLUMN type ENUM('TASK_ASSIGNED','TASK_ACCEPTED','TASK_REJECTED','TASK_SUBMITTED','TASK_APPROVED','TASK_REOPENED','TASK_DUE_SOON','TASK_OVERDUE','SUBTASK_ASSIGNED','SUBTASK_SUBMITTED','SUBTASK_APPROVED','SUBTASK_REJECTED','DEPENDENCY_UNLOCKED','RATING_SUBMITTED','MENTION','DATE_CHANGE_REQUESTED','DATE_CHANGE_APPROVED','DATE_CHANGE_REJECTED') NOT NULL);

    await queryInterface.createTable('date_change_requests', {
      id:                   { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true, allowNull: false },
      entity_type:          { type: Sequelize.ENUM('Docket','Task','SubTask'), allowNull: false },
      entity_id:            { type: Sequelize.UUID, allowNull: false },
      requested_by_id:      { type: Sequelize.UUID, allowNull: false, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      requested_start_date: { type: Sequelize.DATEONLY, allowNull: true },
      requested_end_date:   { type: Sequelize.DATEONLY, allowNull: true },
      current_start_date:   { type: Sequelize.DATEONLY, allowNull: true },
      current_end_date:     { type: Sequelize.DATEONLY, allowNull: true },
      status:               { type: Sequelize.ENUM('PENDING','APPROVED','REJECTED'), allowNull: false, defaultValue: 'PENDING' },
      reviewed_by_id:       { type: Sequelize.UUID, allowNull: true, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      review_comment:       { type: Sequelize.TEXT, allowNull: true },
      reviewed_at:          { type: Sequelize.DATE, allowNull: true },
      created_at:           { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at:           { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') },
    });

    await queryInterface.addIndex('date_change_requests', ['entity_type', 'entity_id']);
    await queryInterface.addIndex('date_change_requests', ['requested_by_id']);
    await queryInterface.addIndex('date_change_requests', ['status']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('date_change_requests');
    await queryInterface.sequelize.query(ALTER TABLE notifications MODIFY COLUMN type ENUM('TASK_ASSIGNED','TASK_ACCEPTED','TASK_REJECTED','TASK_SUBMITTED','TASK_APPROVED','TASK_REOPENED','TASK_DUE_SOON','TASK_OVERDUE','SUBTASK_ASSIGNED','SUBTASK_SUBMITTED','SUBTASK_APPROVED','SUBTASK_REJECTED','DEPENDENCY_UNLOCKED','RATING_SUBMITTED','MENTION') NOT NULL);
  },
};

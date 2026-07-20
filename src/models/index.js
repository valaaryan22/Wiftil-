'use strict';

const fs        = require('fs');
const path      = require('path');
const Sequelize = require('sequelize');
const basename  = path.basename(__filename);
const env       = process.env.NODE_ENV || 'development';
const config    = require(path.join(__dirname, '../config/sequelize.js'))[env];
const db        = {};

const sequelize = new Sequelize(
  config.database,
  config.username,
  config.password,
  {
    host:    config.host,
    port:    config.port,
    dialect: config.dialect,
    logging: config.logging,
    pool:    config.pool,
  }
);

// Auto-load all model files statically (required for Vercel/Webpack bundlers)
const modelFiles = [
  require('./AuditLog.js')(sequelize, Sequelize.DataTypes),
  require('./LeaveRequest.js')(sequelize, Sequelize.DataTypes),
  require('./Notification.js')(sequelize, Sequelize.DataTypes),
  require('./PerformanceRating.js')(sequelize, Sequelize.DataTypes),
  require('./RoleDefinition.js')(sequelize, Sequelize.DataTypes),
  require('./SubTask.js')(sequelize, Sequelize.DataTypes),
  require('./SubTaskAssignment.js')(sequelize, Sequelize.DataTypes),
  require('./SubTaskDependency.js')(sequelize, Sequelize.DataTypes),
  require('./Task.js')(sequelize, Sequelize.DataTypes),
  require('./TaskAssignment.js')(sequelize, Sequelize.DataTypes),
  require('./TaskAttachment.js')(sequelize, Sequelize.DataTypes),
  require('./TaskComment.js')(sequelize, Sequelize.DataTypes),
  require('./Token.js')(sequelize, Sequelize.DataTypes),
  require('./User.js')(sequelize, Sequelize.DataTypes),
  require('./Client.js')(sequelize, Sequelize.DataTypes),
  require('./ClientContact.js')(sequelize, Sequelize.DataTypes),
  require('./ClientCommunicationLog.js')(sequelize, Sequelize.DataTypes),
  // Package / Docket / Ticket module
  require('./ServiceCatalog.js')(sequelize, Sequelize.DataTypes),
  require('./ClientPackage.js')(sequelize, Sequelize.DataTypes),
  require('./PackageService.js')(sequelize, Sequelize.DataTypes),
  require('./PackageAddOn.js')(sequelize, Sequelize.DataTypes),
  require('./Docket.js')(sequelize, Sequelize.DataTypes),
  require('./DocketTicket.js')(sequelize, Sequelize.DataTypes),
  // Client Documents module
  require('./ClientDocument.js')(sequelize, Sequelize.DataTypes),
];

modelFiles.forEach(model => {
  db[model.name] = model;
});

// Run associations
Object.keys(db).forEach(modelName => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;

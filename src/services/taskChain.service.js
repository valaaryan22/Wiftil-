'use strict';

const { Op } = require('sequelize');
const { db } = require('../database/client');
const { writeAuditLog } = require('../utils/auditLog');
const { HTTP_STATUS, AUDIT_CATEGORY, AUDIT_ACTION, SUBTASK_STATUS } = require('../constants');

function notFound(msg = 'Task chain not found') {
  const err = new Error(msg);
  err.statusCode = HTTP_STATUS.NOT_FOUND;
  throw err;
}

function badReq(msg) {
  const err = new Error(msg);
  err.statusCode = HTTP_STATUS.BAD_REQUEST;
  throw err;
}

function conflict(msg) {
  const err = new Error(msg);
  err.statusCode = HTTP_STATUS.CONFLICT;
  throw err;
}

// ─── Seed Default Chains ──────────────────────────────────────────────────────
const DEFAULT_CHAINS = [
  {
    key: 'VIDEO_PRODUCTION_PIPELINE',
    name: 'Video Production Pipeline',
    description: 'Standard 5-step video production and post-production workflow',
    category: 'Video',
    tasks: [
      {
        id: 'step-1',
        title: 'Scriptwriting & Storyboarding',
        description: 'Draft the narrative script, scene breakdown, and visual storyboards.',
        priority: 'HIGH',
        estimatedHours: 6,
        order: 1,
        dependsOnIndex: null,
      },
      {
        id: 'step-2',
        title: 'Shooting & Footage Capture',
        description: 'Record primary camera footage, b-roll, audio dialog, and ambient sound.',
        priority: 'HIGH',
        estimatedHours: 12,
        order: 2,
        dependsOnIndex: 0,
      },
      {
        id: 'step-3',
        title: 'Rough Cut Video Editing',
        description: 'Assemble raw clips onto the timeline, sync multi-camera audio and rough pacing.',
        priority: 'MEDIUM',
        estimatedHours: 8,
        order: 3,
        dependsOnIndex: 1,
      },
      {
        id: 'step-4',
        title: 'Color Grading & Sound Design',
        description: 'Apply LUTs, color correction, sound effects, voiceover leveling, and master mixing.',
        priority: 'MEDIUM',
        estimatedHours: 6,
        order: 4,
        dependsOnIndex: 2,
      },
      {
        id: 'step-5',
        title: 'Client Review & Final Export',
        description: 'Incorporate revision feedback, render high-res formats, and finalize deliverables.',
        priority: 'HIGH',
        estimatedHours: 4,
        order: 5,
        dependsOnIndex: 3,
      },
    ],
  },
  {
    key: 'UI_UX_DESIGN_SPRINT',
    name: 'UI/UX Design Sprint',
    description: 'Comprehensive 4-step user experience design and prototyping workflow',
    category: 'Design',
    tasks: [
      {
        id: 'step-1',
        title: 'User Research & Low-Fi Wireframing',
        description: 'Conduct user journey mapping, information architecture, and layout sketches.',
        priority: 'HIGH',
        estimatedHours: 8,
        order: 1,
        dependsOnIndex: null,
      },
      {
        id: 'step-2',
        title: 'High-Fidelity Visual Mockups',
        description: 'Design typography, colors, components, and polished mobile & desktop screens.',
        priority: 'MEDIUM',
        estimatedHours: 14,
        order: 2,
        dependsOnIndex: 0,
      },
      {
        id: 'step-3',
        title: 'Interactive Clickable Prototype',
        description: 'Connect micro-interactions, responsive states, and transitions in Figma.',
        priority: 'MEDIUM',
        estimatedHours: 6,
        order: 3,
        dependsOnIndex: 1,
      },
      {
        id: 'step-4',
        title: 'Design Specs & Developer Handoff',
        description: 'Document design tokens, exported SVG assets, redlines, and layout guide.',
        priority: 'MEDIUM',
        estimatedHours: 4,
        order: 4,
        dependsOnIndex: 2,
      },
    ],
  },
  {
    key: 'FULLSTACK_FEATURE_DEV',
    name: 'Full-Stack Feature Development',
    description: '4-phase engineering sequence from database schema to QA testing',
    category: 'Engineering',
    tasks: [
      {
        id: 'step-1',
        title: 'Database Schema & API Contract',
        description: 'Define Sequelize/Prisma models, migrations, endpoints, and OpenAPI specs.',
        priority: 'HIGH',
        estimatedHours: 6,
        order: 1,
        dependsOnIndex: null,
      },
      {
        id: 'step-2',
        title: 'Backend API & Business Logic',
        description: 'Implement controllers, service methods, validation middlewares, and unit tests.',
        priority: 'MEDIUM',
        estimatedHours: 12,
        order: 2,
        dependsOnIndex: 0,
      },
      {
        id: 'step-3',
        title: 'Frontend UI Components & State',
        description: 'Build React UI views, Redux slices, form validation, and toast notifications.',
        priority: 'MEDIUM',
        estimatedHours: 12,
        order: 3,
        dependsOnIndex: 1,
      },
      {
        id: 'step-4',
        title: 'Integration Testing & Verification',
        description: 'Perform end-to-end user testing, error handling checks, and regression verification.',
        priority: 'HIGH',
        estimatedHours: 6,
        order: 4,
        dependsOnIndex: 2,
      },
    ],
  },
];

async function seedDefaultChainsIfEmpty() {
  try {
    const count = await db.TaskChain.count();
    if (count === 0) {
      for (const item of DEFAULT_CHAINS) {
        await db.TaskChain.create(item);
      }
    }
  } catch (err) {
    console.error('Error auto-seeding task chains:', err.message);
  }
}

// ─── Service Methods ──────────────────────────────────────────────────────────

async function getTaskChains({ search, category, isActive }) {
  await seedDefaultChainsIfEmpty();

  const where = {};
  if (isActive !== undefined && isActive !== null && isActive !== '') {
    where.isActive = isActive === 'true' || isActive === true;
  }
  if (category) {
    where.category = category;
  }
  if (search) {
    where[Op.or] = [
      { key: { [Op.like]: `%${search}%` } },
      { name: { [Op.like]: `%${search}%` } },
      { description: { [Op.like]: `%${search}%` } },
    ];
  }

  const chains = await db.TaskChain.findAll({
    where,
    order: [['createdAt', 'ASC']],
    include: [{ model: db.User, as: 'createdBy', attributes: ['id', 'firstName', 'lastName', 'email'] }],
  });

  return chains;
}

async function getTaskChainById(id) {
  await seedDefaultChainsIfEmpty();

  const chain = await db.TaskChain.findOne({
    where: {
      [Op.or]: [{ id }, { key: id }],
    },
    include: [{ model: db.User, as: 'createdBy', attributes: ['id', 'firstName', 'lastName', 'email'] }],
  });

  if (!chain) notFound('Task chain not found');
  return chain;
}

async function createTaskChain({ key, name, description, category, tasks, requestingUser, req }) {
  if (!key || !key.trim()) badReq('Task chain key is required');
  if (!name || !name.trim()) badReq('Task chain name is required');

  const formattedKey = key.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '_');

  const existing = await db.TaskChain.findOne({ where: { key: formattedKey } });
  if (existing) conflict(`A task chain with key "${formattedKey}" already exists`);

  const taskList = Array.isArray(tasks) ? tasks.map((t, index) => ({
    id: t.id || `task-${Date.now()}-${index}`,
    title: t.title ? t.title.trim() : `Task ${index + 1}`,
    description: t.description || '',
    priority: t.priority || 'MEDIUM',
    estimatedHours: t.estimatedHours !== undefined && t.estimatedHours !== null && !isNaN(t.estimatedHours)
      ? parseFloat(t.estimatedHours)
      : null,
    order: t.order || index + 1,
    dependsOnIndex: t.dependsOnIndex !== undefined && t.dependsOnIndex !== null && t.dependsOnIndex !== ''
      ? parseInt(t.dependsOnIndex, 10)
      : null,
  })) : [];

  const chain = await db.TaskChain.create({
    key: formattedKey,
    name: name.trim(),
    description: description || null,
    category: category || 'General',
    tasks: taskList,
    createdById: requestingUser ? requestingUser.id : null,
    isActive: true,
  });

  if (requestingUser) {
    await writeAuditLog({
      performedBy: requestingUser,
      action: AUDIT_ACTION.TASK_CREATED || 'TASK_CHAIN_CREATED',
      category: AUDIT_CATEGORY.TASK,
      entity: 'TaskChain',
      entityId: chain.id,
      entityName: chain.name,
      description: `Created task chain "${chain.name}" [${chain.key}] with ${taskList.length} tasks`,
      req,
    });
  }

  return chain;
}

async function updateTaskChain({ id, data, requestingUser, req }) {
  const chain = await getTaskChainById(id);

  if (data.key && data.key.trim()) {
    const formattedKey = data.key.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '_');
    if (formattedKey !== chain.key) {
      const existing = await db.TaskChain.findOne({
        where: { key: formattedKey, id: { [Op.ne]: chain.id } },
      });
      if (existing) conflict(`A task chain with key "${formattedKey}" already exists`);
      chain.key = formattedKey;
    }
  }

  if (data.name !== undefined) chain.name = data.name.trim();
  if (data.description !== undefined) chain.description = data.description;
  if (data.category !== undefined) chain.category = data.category;
  if (data.isActive !== undefined) chain.isActive = !!data.isActive;

  if (Array.isArray(data.tasks)) {
    chain.tasks = data.tasks.map((t, index) => ({
      id: t.id || `task-${Date.now()}-${index}`,
      title: t.title ? t.title.trim() : `Task ${index + 1}`,
      description: t.description || '',
      priority: t.priority || 'MEDIUM',
      estimatedHours: t.estimatedHours !== undefined && t.estimatedHours !== null && !isNaN(t.estimatedHours)
        ? parseFloat(t.estimatedHours)
        : null,
      order: t.order || index + 1,
      dependsOnIndex: t.dependsOnIndex !== undefined && t.dependsOnIndex !== null && t.dependsOnIndex !== ''
        ? parseInt(t.dependsOnIndex, 10)
        : null,
    }));
  }

  await chain.save();

  if (requestingUser) {
    await writeAuditLog({
      performedBy: requestingUser,
      action: AUDIT_ACTION.TASK_UPDATED || 'TASK_CHAIN_UPDATED',
      category: AUDIT_CATEGORY.TASK,
      entity: 'TaskChain',
      entityId: chain.id,
      entityName: chain.name,
      description: `Updated task chain "${chain.name}" [${chain.key}]`,
      req,
    });
  }

  return chain;
}

async function deleteTaskChain({ id, requestingUser, req }) {
  const chain = await getTaskChainById(id);

  await chain.destroy();

  if (requestingUser) {
    await writeAuditLog({
      performedBy: requestingUser,
      action: AUDIT_ACTION.TASK_DELETED || 'TASK_CHAIN_DELETED',
      category: AUDIT_CATEGORY.TASK,
      entity: 'TaskChain',
      entityId: id,
      entityName: chain.name,
      description: `Deleted task chain "${chain.name}" [${chain.key}]`,
      req,
    });
  }

  return true;
}

/**
 * Applies a TaskChain to an existing master Ticket/Task.
 * Creates all subtasks in the chain sequentially and wires up dependencies.
 */
async function applyTaskChainToTask({ taskId, chainId, chainKey, requestingUser, req }) {
  const task = await db.Task.findOne({
    where: { id: taskId, deletedAt: null },
    attributes: ['id', 'title', 'status', 'managerId', 'estimatedHours', 'startDate', 'dueDate', 'docketId'],
  });

  if (!task) notFound('Parent ticket/task not found');

  if (!['ACCEPTED', 'IN_PROGRESS', 'REOPENED'].includes(task.status)) {
    conflict(`Cannot add tasks when ticket status is "${task.status}". Ticket must be ACCEPTED, IN_PROGRESS, or REOPENED.`);
  }

  // Find chain
  const chainIdentifier = chainId || chainKey;
  if (!chainIdentifier) badReq('chainId or chainKey is required');

  const chain = await db.TaskChain.findOne({
    where: {
      [Op.or]: [{ id: chainIdentifier }, { key: chainIdentifier }],
    },
  });

  if (!chain) notFound(`Task chain "${chainIdentifier}" not found`);

  const chainTasks = Array.isArray(chain.tasks) ? chain.tasks : [];
  if (chainTasks.length === 0) {
    badReq(`Task chain "${chain.name}" does not have any tasks defined`);
  }

  const createdTasks = [];

  // Step 1: Create all subtasks
  for (let i = 0; i < chainTasks.length; i++) {
    const item = chainTasks[i];
    const subTask = await db.SubTask.create({
      taskId: task.id,
      docketId: task.docketId || null,
      title: item.title,
      description: item.description || null,
      priority: item.priority || 'MEDIUM',
      estimatedHours: item.estimatedHours ? parseFloat(item.estimatedHours) : null,
      startDate: task.startDate ? new Date(task.startDate) : null,
      dueDate: task.dueDate ? new Date(task.dueDate) : null,
      createdById: requestingUser.id,
      status: SUBTASK_STATUS.CREATED,
    });

    createdTasks.push(subTask);
  }

  // Step 2: Establish dependencies
  for (let i = 0; i < chainTasks.length; i++) {
    const item = chainTasks[i];
    const depIdx = item.dependsOnIndex;

    if (depIdx !== null && depIdx !== undefined && depIdx >= 0 && depIdx < createdTasks.length && depIdx !== i) {
      const currentSub = createdTasks[i];
      const prerequisiteSub = createdTasks[depIdx];

      await db.SubTaskDependency.create({
        subTaskId: currentSub.id,
        prerequisiteId: prerequisiteSub.id,
      });

      // Update dependent task status to LOCKED if prerequisite isn't finished
      await currentSub.update({ status: SUBTASK_STATUS.LOCKED });
    }
  }

  // Fetch full details of created tasks
  const fullCreatedTasks = await db.SubTask.findAll({
    where: {
      id: { [Op.in]: createdTasks.map(t => t.id) },
    },
    include: [
      {
        model: db.User, as: 'createdBy',
        attributes: ['id', 'firstName', 'lastName', 'email'],
      },
      {
        model: db.SubTaskDependency, as: 'dependencies',
        include: [{ model: db.SubTask, as: 'prerequisite', attributes: ['id', 'title', 'status'] }],
      },
    ],
  });

  if (requestingUser) {
    await writeAuditLog({
      performedBy: requestingUser,
      action: AUDIT_ACTION.TASK_CREATED || 'TASK_CHAIN_APPLIED',
      category: AUDIT_CATEGORY.TASK,
      entity: 'TaskChain',
      entityId: chain.id,
      entityName: chain.name,
      description: `Applied task chain "${chain.name}" (${fullCreatedTasks.length} tasks) to ticket "${task.title}"`,
      req,
    });
  }

  return {
    chain: {
      id: chain.id,
      key: chain.key,
      name: chain.name,
    },
    ticketId: task.id,
    totalCreated: fullCreatedTasks.length,
    tasks: fullCreatedTasks,
  };
}

module.exports = {
  getTaskChains,
  getTaskChainById,
  createTaskChain,
  updateTaskChain,
  deleteTaskChain,
  applyTaskChainToTask,
};

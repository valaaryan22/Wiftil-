'use strict';

/**
 * Wiftil Seed Script
 * ------------------
 * Creates realistic demo data across all tables.
 * Safe to re-run — skips user/task seed if users already exist.
 *
 * Run: node scripts/seed.js
 */

require('dotenv').config();
const { v4: uuidv4 } = require('uuid');
const db = require('../src/models');

const daysFromNow = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const daysAgo     = (n) => daysFromNow(-n);

// ─── Sub-task titles per parent task ─────────────────────────────────────────
const SUBTASK_MAP = {
  'Build Authentication Microservice': [
    'JWT token generation & validation',
    'Refresh token rotation logic',
    'Email verification flow',
  ],
  'Redesign Dashboard UI': [
    'Wireframes & design system tokens',
    'Dashboard chart components',
  ],
  'Mobile App v2.0 Release': [
    'Push notifications module',
    'Offline mode with local storage',
    'Biometric authentication',
  ],
  'Set Up CI/CD Pipeline': [
    'GitHub Actions workflow',
    'Docker build & ECR push',
  ],
  'Frontend Performance Optimization': [
    'Code splitting & lazy loading',
    'Image optimization pipeline',
  ],
  'API Documentation': [
    'Swagger setup & auth endpoint docs',
  ],
};

function subTaskStatus(taskStatus, index) {
  if (taskStatus === 'COMPLETED')      return 'FINAL_APPROVED';
  if (taskStatus === 'MANAGER_REVIEW') return index === 0 ? 'FINAL_APPROVED' : 'TEAM_LEAD_APPROVED';
  if (taskStatus === 'IN_PROGRESS')    return index === 0 ? 'IN_PROGRESS' : 'ASSIGNED';
  if (taskStatus === 'ASSIGNED')       return 'ASSIGNED';
  return 'CREATED';
}

// ─────────────────────────────────────────────────────────────────────────────
async function seed() {
  await db.sequelize.authenticate();
  console.log('✅ Connected to database\n');

  // ── 1. Roles ──────────────────────────────────────────────────────────────
  console.log('🌱 Seeding roles...');
  const roleRows = [
    { name: 'EMPLOYEE',   displayName: 'Employee',    accessLevel: 5, color: '#6B7280', isSystem: true, description: 'Regular team member' },
    { name: 'LEADER',     displayName: 'Team Leader', accessLevel: 4, color: '#3B82F6', isSystem: true, description: 'Leads a small team' },
    { name: 'SUPERVISOR', displayName: 'Supervisor',  accessLevel: 3, color: '#8B5CF6', isSystem: true, description: 'Oversees team leads' },
    { name: 'MANAGER',    displayName: 'Manager',     accessLevel: 2, color: '#F59E0B', isSystem: true, description: 'Manages supervisors' },
    { name: 'BOSS',       displayName: 'Boss',        accessLevel: 1, color: '#EF4444', isSystem: true, description: 'Top-level executive' },
  ];
  const roles = {};
  for (const r of roleRows) {
    const [role] = await db.RoleDefinition.findOrCreate({ where: { name: r.name }, defaults: { id: uuidv4(), ...r } });
    roles[r.name] = role;
  }
  console.log('   ✔ Roles ready\n');

  // ── Guard: skip if users already exist ────────────────────────────────────
  const existingUsers = await db.User.count();
  if (existingUsers > 0) {
    console.log(`ℹ️  Users already exist (${existingUsers}). Skipping user/task seed.\n`);
    console.log('🎉 Done — database already has data!\n');
    await db.sequelize.close();
    return;
  }

  // ── 2. Users ──────────────────────────────────────────────────────────────
  console.log('🌱 Seeding users...');

  // Boss
  const bossId = uuidv4();
  await db.User.create({
    id: bossId, email: 'aryan.boss@wiftil.com', password: 'Admin@123',
    firstName: 'Aryan', lastName: 'Sharma', roleId: roles['BOSS'].id,
    isActive: true, isEmailVerified: true,
    department: 'Executive', jobTitle: 'Chief Executive Officer', phone: '+91-9800000001',
  });

  // Managers
  const mgr1Id = uuidv4(), mgr2Id = uuidv4();
  await db.User.bulkCreate([
    { id: mgr1Id, email: 'priya.manager@wiftil.com', password: 'Manager@123',
      firstName: 'Priya', lastName: 'Verma', roleId: roles['MANAGER'].id,
      isActive: true, isEmailVerified: true, managerId: bossId,
      department: 'Engineering', jobTitle: 'Engineering Manager', phone: '+91-9800000002' },
    { id: mgr2Id, email: 'rohit.manager@wiftil.com', password: 'Manager@123',
      firstName: 'Rohit', lastName: 'Mehta', roleId: roles['MANAGER'].id,
      isActive: true, isEmailVerified: true, managerId: bossId,
      department: 'Design', jobTitle: 'Design Manager', phone: '+91-9800000003' },
  ], { individualHooks: true });

  // Supervisors
  const sup1Id = uuidv4(), sup2Id = uuidv4(), sup3Id = uuidv4();
  await db.User.bulkCreate([
    { id: sup1Id, email: 'anita.supervisor@wiftil.com', password: 'Super@123',
      firstName: 'Anita', lastName: 'Singh', roleId: roles['SUPERVISOR'].id,
      isActive: true, isEmailVerified: true, managerId: mgr1Id,
      department: 'Engineering', jobTitle: 'Backend Supervisor', phone: '+91-9800000004' },
    { id: sup2Id, email: 'karan.supervisor@wiftil.com', password: 'Super@123',
      firstName: 'Karan', lastName: 'Patel', roleId: roles['SUPERVISOR'].id,
      isActive: true, isEmailVerified: true, managerId: mgr1Id,
      department: 'Engineering', jobTitle: 'Frontend Supervisor', phone: '+91-9800000005' },
    { id: sup3Id, email: 'sneha.supervisor@wiftil.com', password: 'Super@123',
      firstName: 'Sneha', lastName: 'Joshi', roleId: roles['SUPERVISOR'].id,
      isActive: true, isEmailVerified: true, managerId: mgr2Id,
      department: 'Design', jobTitle: 'UI/UX Supervisor', phone: '+91-9800000006' },
  ], { individualHooks: true });

  // Team Leaders
  const lead1Id = uuidv4(), lead2Id = uuidv4(), lead3Id = uuidv4(), lead4Id = uuidv4();
  await db.User.bulkCreate([
    { id: lead1Id, email: 'devesh.lead@wiftil.com', password: 'Leader@123',
      firstName: 'Devesh', lastName: 'Kumar', roleId: roles['LEADER'].id,
      isActive: true, isEmailVerified: true, managerId: sup1Id,
      department: 'Engineering', jobTitle: 'Backend Team Lead', phone: '+91-9800000007' },
    { id: lead2Id, email: 'pooja.lead@wiftil.com', password: 'Leader@123',
      firstName: 'Pooja', lastName: 'Nair', roleId: roles['LEADER'].id,
      isActive: true, isEmailVerified: true, managerId: sup2Id,
      department: 'Engineering', jobTitle: 'Frontend Team Lead', phone: '+91-9800000008' },
    { id: lead3Id, email: 'rahul.lead@wiftil.com', password: 'Leader@123',
      firstName: 'Rahul', lastName: 'Gupta', roleId: roles['LEADER'].id,
      isActive: true, isEmailVerified: true, managerId: sup2Id,
      department: 'Engineering', jobTitle: 'Mobile Team Lead', phone: '+91-9800000009' },
    { id: lead4Id, email: 'meera.lead@wiftil.com', password: 'Leader@123',
      firstName: 'Meera', lastName: 'Kapoor', roleId: roles['LEADER'].id,
      isActive: true, isEmailVerified: true, managerId: sup3Id,
      department: 'Design', jobTitle: 'Design Team Lead', phone: '+91-9800000010' },
  ], { individualHooks: true });

  // Employees (10)
  const empIds = Array.from({ length: 10 }, () => uuidv4());
  const empRows = [
    { id: empIds[0], email: 'aarav.shah@wiftil.com',      firstName: 'Aarav',   lastName: 'Shah',      managerId: lead1Id, department: 'Engineering', jobTitle: 'Backend Developer',   phone: '+91-9800000011' },
    { id: empIds[1], email: 'ishaan.trivedi@wiftil.com',  firstName: 'Ishaan',  lastName: 'Trivedi',   managerId: lead1Id, department: 'Engineering', jobTitle: 'Backend Developer',   phone: '+91-9800000012' },
    { id: empIds[2], email: 'diya.rao@wiftil.com',        firstName: 'Diya',    lastName: 'Rao',       managerId: lead2Id, department: 'Engineering', jobTitle: 'Frontend Developer',  phone: '+91-9800000013' },
    { id: empIds[3], email: 'vivaan.chaudhary@wiftil.com',firstName: 'Vivaan',  lastName: 'Chaudhary', managerId: lead2Id, department: 'Engineering', jobTitle: 'Frontend Developer',  phone: '+91-9800000014' },
    { id: empIds[4], email: 'anika.reddy@wiftil.com',     firstName: 'Anika',   lastName: 'Reddy',     managerId: lead2Id, department: 'Engineering', jobTitle: 'Frontend Developer',  phone: '+91-9800000015' },
    { id: empIds[5], email: 'kabir.malhotra@wiftil.com',  firstName: 'Kabir',   lastName: 'Malhotra',  managerId: lead3Id, department: 'Engineering', jobTitle: 'Mobile Developer',    phone: '+91-9800000016' },
    { id: empIds[6], email: 'zara.iyer@wiftil.com',       firstName: 'Zara',    lastName: 'Iyer',      managerId: lead3Id, department: 'Engineering', jobTitle: 'Mobile Developer',    phone: '+91-9800000017' },
    { id: empIds[7], email: 'arjun.bose@wiftil.com',      firstName: 'Arjun',   lastName: 'Bose',      managerId: lead4Id, department: 'Design',      jobTitle: 'UI Designer',         phone: '+91-9800000018' },
    { id: empIds[8], email: 'saanvi.pillai@wiftil.com',   firstName: 'Saanvi',  lastName: 'Pillai',    managerId: lead4Id, department: 'Design',      jobTitle: 'UX Designer',         phone: '+91-9800000019' },
    { id: empIds[9], email: 'rehan.khan@wiftil.com',      firstName: 'Rehan',   lastName: 'Khan',      managerId: lead1Id, department: 'Engineering', jobTitle: 'DevOps Engineer',     phone: '+91-9800000020' },
  ];
  await db.User.bulkCreate(
    empRows.map(e => ({ ...e, password: 'Emp@123', roleId: roles['EMPLOYEE'].id, isActive: true, isEmailVerified: true })),
    { individualHooks: true }
  );
  console.log('   ✔ 18 users created (1 Boss · 2 Managers · 3 Supervisors · 4 Leaders · 10 Employees)\n');

  // ── 3. Tasks ──────────────────────────────────────────────────────────────
  console.log('🌱 Seeding tasks, subtasks, assignments & comments...');

  const taskDefs = [
    {
      title: 'Build Authentication Microservice',
      description: 'Design and implement a secure JWT-based authentication microservice with refresh token rotation, email verification, and role-based access control.',
      priority: 'CRITICAL', status: 'IN_PROGRESS',
      startDate: daysAgo(15), dueDate: daysFromNow(10), estimatedHours: 80, actualHours: 45, completionPercent: 55,
      createdById: mgr1Id, managerId: mgr1Id, leadId: lead1Id, members: [empIds[0], empIds[1]],
    },
    {
      title: 'Redesign Dashboard UI',
      description: 'Revamp the analytics dashboard with glassmorphism design, dark mode support, real-time charts, and responsive layout.',
      priority: 'HIGH', status: 'ASSIGNED',
      startDate: daysAgo(5), dueDate: daysFromNow(20), estimatedHours: 60, actualHours: 10, completionPercent: 15,
      createdById: mgr2Id, managerId: mgr2Id, leadId: lead4Id, members: [empIds[7], empIds[8]],
    },
    {
      title: 'Mobile App v2.0 Release',
      description: 'Release the second major version with push notifications, offline mode, and biometric authentication.',
      priority: 'HIGH', status: 'MANAGER_REVIEW',
      startDate: daysAgo(30), dueDate: daysFromNow(5), estimatedHours: 120, actualHours: 110, completionPercent: 90,
      createdById: mgr1Id, managerId: mgr1Id, leadId: lead3Id, members: [empIds[5], empIds[6]],
    },
    {
      title: 'Set Up CI/CD Pipeline',
      description: 'Configure GitHub Actions for automated testing, Docker builds, and zero-downtime deployments to AWS ECS.',
      priority: 'MEDIUM', status: 'COMPLETED',
      startDate: daysAgo(25), dueDate: daysAgo(5), estimatedHours: 30, actualHours: 28, completionPercent: 100,
      createdById: bossId, managerId: mgr1Id, leadId: lead1Id, members: [empIds[9]],
    },
    {
      title: 'Frontend Performance Optimization',
      description: 'Achieve Lighthouse scores above 90. Implement code splitting, lazy loading, and image optimization.',
      priority: 'MEDIUM', status: 'IN_PROGRESS',
      startDate: daysAgo(8), dueDate: daysFromNow(15), estimatedHours: 40, actualHours: 18, completionPercent: 40,
      createdById: mgr1Id, managerId: mgr1Id, leadId: lead2Id, members: [empIds[2], empIds[3], empIds[4]],
    },
    {
      title: 'API Documentation',
      description: 'Write comprehensive Swagger/OpenAPI docs for all REST endpoints with examples, error codes, and auth details.',
      priority: 'LOW', status: 'CREATED',
      startDate: daysFromNow(5), dueDate: daysFromNow(25), estimatedHours: 20, actualHours: 0, completionPercent: 0,
      createdById: bossId, managerId: mgr1Id, leadId: null, members: [],
    },
  ];

  for (const t of taskDefs) {
    const taskId = uuidv4();
    const { leadId, members, ...fields } = t;

    await db.Task.create({ id: taskId, ...fields });

    // TaskAssignment (no `status` field in model)
    if (leadId) {
      await db.TaskAssignment.create({
        id: uuidv4(), taskId, teamLeadId: leadId, assignedById: fields.createdById,
      });
    }

    // SubTasks
    const stTitles = SUBTASK_MAP[t.title] || ['Subtask 1', 'Subtask 2'];
    for (let i = 0; i < stTitles.length; i++) {
      const stId     = uuidv4();
      const memberId = members[i % members.length] ?? (leadId || fields.createdById);
      const stStatus = subTaskStatus(t.status, i);

      await db.SubTask.create({
        id: stId, taskId,
        title: stTitles[i],
        description: `Subtask of "${t.title}"`,
        priority: t.priority,
        status: stStatus,
        startDate: t.startDate,
        dueDate: t.dueDate,
        estimatedHours: parseFloat((t.estimatedHours / stTitles.length).toFixed(1)),
        actualHours: stStatus === 'FINAL_APPROVED' ? parseFloat((t.estimatedHours / stTitles.length).toFixed(1)) : 0,
        createdById: leadId || fields.createdById,
      });

      if (members.length > 0 && leadId) {
        await db.SubTaskAssignment.create({
          id: uuidv4(), subTaskId: stId, memberId, assignedById: leadId,
        });
      }
    }

    // Comments
    if (leadId) {
      await db.TaskComment.create({
        id: uuidv4(), taskId, authorId: leadId,
        content: `Planning complete. Team is aligned on scope of "${t.title}".`,
        mentions: [],
      });
    }
    if (members.length > 0) {
      await db.TaskComment.create({
        id: uuidv4(), taskId, authorId: members[0],
        content: 'Started working on this. Will update by EOD.',
        mentions: [],
      });
    }
  }
  console.log(`   ✔ ${taskDefs.length} tasks with subtasks, assignments & comments\n`);

  // ── 4. Leave Requests ─────────────────────────────────────────────────────
  console.log('🌱 Seeding leave requests...');
  const leaveRows = [
    { requesterId: empIds[0], reviewerId: lead1Id, leaveType: 'CASUAL',   status: 'APPROVED',  startDate: daysFromNow(10), endDate: daysFromNow(12), totalDays: 3,  reason: 'Personal work at home town', reviewComment: 'Approved. Have a good trip.' },
    { requesterId: empIds[2], reviewerId: lead2Id, leaveType: 'SICK',     status: 'PENDING',   startDate: daysFromNow(20), endDate: daysFromNow(22), totalDays: 3,  reason: 'Dental surgery scheduled' },
    { requesterId: empIds[5], reviewerId: lead3Id, leaveType: 'SICK',     status: 'APPROVED',  startDate: daysAgo(10),     endDate: daysAgo(8),      totalDays: 3,  reason: 'Flu and fever', reviewComment: 'Get well soon.' },
    { requesterId: empIds[7], reviewerId: lead4Id, leaveType: 'ANNUAL',   status: 'PENDING',   startDate: daysFromNow(30), endDate: daysFromNow(40), totalDays: 11, reason: 'Annual family vacation' },
    { requesterId: empIds[1], reviewerId: lead1Id, leaveType: 'CASUAL',   status: 'REJECTED',  startDate: daysAgo(5),      endDate: daysAgo(4),      totalDays: 2,  reason: 'Need time off', reviewComment: 'Critical sprint in progress — please reschedule.' },
    { requesterId: lead2Id,   reviewerId: sup2Id,  leaveType: 'CASUAL',   status: 'PENDING',   startDate: daysFromNow(15), endDate: daysFromNow(17), totalDays: 3,  reason: 'Family function' },
  ];
  for (const l of leaveRows) {
    await db.LeaveRequest.create({ id: uuidv4(), ...l });
  }
  console.log(`   ✔ ${leaveRows.length} leave requests\n`);

  // ── 5. Performance Ratings ────────────────────────────────────────────────
  console.log('🌱 Seeding performance ratings...');
  // PerformanceRating fields: quality, timeliness, communication, accuracy, ownership (all 1-10), overall (float)
  const perfRows = [
    { ratedUserId: empIds[0], ratedById: lead1Id, ratingType: 'DIRECT', periodLabel: 'Q2-2026',
      quality: 9, timeliness: 8, communication: 8, accuracy: 9, ownership: 9, overall: 8.6,
      comments: 'Excellent backend work, ahead of schedule.' },
    { ratedUserId: empIds[1], ratedById: lead1Id, ratingType: 'DIRECT', periodLabel: 'Q2-2026',
      quality: 8, timeliness: 6, communication: 9, accuracy: 7, ownership: 8, overall: 7.6,
      comments: 'Good teamwork but needs to improve delivery pace.' },
    { ratedUserId: empIds[2], ratedById: lead2Id, ratingType: 'DIRECT', periodLabel: 'Q2-2026',
      quality: 8, timeliness: 8, communication: 9, accuracy: 8, ownership: 8, overall: 8.2,
      comments: 'Consistent performer. Great frontend skills.' },
    { ratedUserId: empIds[5], ratedById: lead3Id, ratingType: 'DIRECT', periodLabel: 'Q2-2026',
      quality: 9, timeliness: 9, communication: 8, accuracy: 9, ownership: 10, overall: 9.0,
      comments: 'Mobile v2 is mostly his work. Outstanding!' },
    { ratedUserId: empIds[9], ratedById: lead1Id, ratingType: 'DIRECT', periodLabel: 'Q2-2026',
      quality: 8, timeliness: 8, communication: 8, accuracy: 8, ownership: 8, overall: 8.0,
      comments: 'Pipeline setup was clean and well-documented.' },
    { ratedUserId: lead1Id,   ratedById: sup1Id,  ratingType: 'DIRECT', periodLabel: 'Q2-2026',
      quality: 8, timeliness: 8, communication: 9, accuracy: 8, ownership: 9, overall: 8.4,
      comments: 'Solid team leadership. Keeps the team motivated.' },
  ];
  for (const p of perfRows) {
    await db.PerformanceRating.create({ id: uuidv4(), ...p });
  }
  console.log(`   ✔ ${perfRows.length} performance ratings\n`);

  await db.sequelize.close();

  console.log('════════════════════════════════════════════════════════════════');
  console.log('🎉 Database seeded successfully!\n');
  console.log('📋 Login credentials (all on wiftil.com domain):');
  console.log('');
  console.log('   Role        Email                           Password');
  console.log('   ─────────── ─────────────────────────────── ────────────');
  console.log('   Boss      → aryan.boss@wiftil.com           Admin@123');
  console.log('   Manager   → priya.manager@wiftil.com        Manager@123');
  console.log('   Manager   → rohit.manager@wiftil.com        Manager@123');
  console.log('   Supervisor→ anita.supervisor@wiftil.com     Super@123');
  console.log('   Leader    → devesh.lead@wiftil.com          Leader@123');
  console.log('   Employee  → aarav.shah@wiftil.com           Emp@123');
  console.log('════════════════════════════════════════════════════════════════\n');
}

seed().catch(err => {
  console.error('\n💥 Seed failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});

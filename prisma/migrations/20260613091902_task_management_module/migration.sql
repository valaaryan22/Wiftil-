-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('CREATED', 'ASSIGNED', 'ACCEPTED', 'REJECTED', 'IN_PROGRESS', 'SUBMITTED', 'MANAGER_REVIEW', 'MANAGER_APPROVED', 'COMPLETED', 'REOPENED');

-- CreateEnum
CREATE TYPE "SubTaskStatus" AS ENUM ('CREATED', 'ASSIGNED', 'LOCKED', 'AVAILABLE', 'IN_PROGRESS', 'SUBMITTED', 'TEAM_LEAD_REVIEW', 'TEAM_LEAD_APPROVED', 'TEAM_LEAD_REJECTED', 'MANAGER_REVIEW', 'FINAL_APPROVED', 'REOPENED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('TASK_ASSIGNED', 'TASK_ACCEPTED', 'TASK_REJECTED', 'TASK_SUBMITTED', 'TASK_APPROVED', 'TASK_REOPENED', 'TASK_DUE_SOON', 'TASK_OVERDUE', 'SUBTASK_ASSIGNED', 'SUBTASK_SUBMITTED', 'SUBTASK_APPROVED', 'SUBTASK_REJECTED', 'DEPENDENCY_UNLOCKED', 'RATING_SUBMITTED', 'MENTION');

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "TaskStatus" NOT NULL DEFAULT 'CREATED',
    "startDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "estimatedHours" DOUBLE PRECISION,
    "actualHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "completionPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "managerId" TEXT,
    "managerRemark" TEXT,
    "managerActionAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_assignments" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "teamLeadId" TEXT NOT NULL,
    "assignedById" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sub_tasks" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "SubTaskStatus" NOT NULL DEFAULT 'CREATED',
    "startDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "estimatedHours" DOUBLE PRECISION,
    "actualHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewComment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sub_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sub_task_assignments" (
    "id" TEXT NOT NULL,
    "subTaskId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "contribution" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "assignedById" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sub_task_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sub_task_dependencies" (
    "id" TEXT NOT NULL,
    "subTaskId" TEXT NOT NULL,
    "prerequisiteId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sub_task_dependencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance_ratings" (
    "id" TEXT NOT NULL,
    "subTaskId" TEXT NOT NULL,
    "ratedUserId" TEXT NOT NULL,
    "ratedById" TEXT NOT NULL,
    "quality" INTEGER NOT NULL,
    "timeliness" INTEGER NOT NULL,
    "communication" INTEGER NOT NULL,
    "accuracy" INTEGER NOT NULL,
    "ownership" INTEGER NOT NULL,
    "overall" DOUBLE PRECISION NOT NULL,
    "comments" TEXT,
    "ratedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "performance_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_comments" (
    "id" TEXT NOT NULL,
    "taskId" TEXT,
    "subTaskId" TEXT,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "mentions" TEXT[],
    "editedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_attachments" (
    "id" TEXT NOT NULL,
    "taskId" TEXT,
    "subTaskId" TEXT,
    "uploadedById" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tasks_status_idx" ON "tasks"("status");

-- CreateIndex
CREATE INDEX "tasks_managerId_idx" ON "tasks"("managerId");

-- CreateIndex
CREATE INDEX "tasks_createdById_idx" ON "tasks"("createdById");

-- CreateIndex
CREATE INDEX "tasks_dueDate_idx" ON "tasks"("dueDate");

-- CreateIndex
CREATE INDEX "task_assignments_taskId_idx" ON "task_assignments"("taskId");

-- CreateIndex
CREATE INDEX "task_assignments_teamLeadId_idx" ON "task_assignments"("teamLeadId");

-- CreateIndex
CREATE UNIQUE INDEX "task_assignments_taskId_teamLeadId_key" ON "task_assignments"("taskId", "teamLeadId");

-- CreateIndex
CREATE INDEX "sub_tasks_taskId_idx" ON "sub_tasks"("taskId");

-- CreateIndex
CREATE INDEX "sub_tasks_status_idx" ON "sub_tasks"("status");

-- CreateIndex
CREATE INDEX "sub_tasks_dueDate_idx" ON "sub_tasks"("dueDate");

-- CreateIndex
CREATE INDEX "sub_task_assignments_subTaskId_idx" ON "sub_task_assignments"("subTaskId");

-- CreateIndex
CREATE INDEX "sub_task_assignments_memberId_idx" ON "sub_task_assignments"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "sub_task_assignments_subTaskId_memberId_key" ON "sub_task_assignments"("subTaskId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX "sub_task_dependencies_subTaskId_prerequisiteId_key" ON "sub_task_dependencies"("subTaskId", "prerequisiteId");

-- CreateIndex
CREATE INDEX "performance_ratings_ratedUserId_idx" ON "performance_ratings"("ratedUserId");

-- CreateIndex
CREATE INDEX "performance_ratings_subTaskId_idx" ON "performance_ratings"("subTaskId");

-- CreateIndex
CREATE UNIQUE INDEX "performance_ratings_subTaskId_ratedUserId_key" ON "performance_ratings"("subTaskId", "ratedUserId");

-- CreateIndex
CREATE INDEX "task_comments_taskId_idx" ON "task_comments"("taskId");

-- CreateIndex
CREATE INDEX "task_comments_subTaskId_idx" ON "task_comments"("subTaskId");

-- CreateIndex
CREATE INDEX "task_attachments_taskId_idx" ON "task_attachments"("taskId");

-- CreateIndex
CREATE INDEX "task_attachments_subTaskId_idx" ON "task_attachments"("subTaskId");

-- CreateIndex
CREATE INDEX "notifications_userId_isRead_idx" ON "notifications"("userId", "isRead");

-- CreateIndex
CREATE INDEX "notifications_createdAt_idx" ON "notifications"("createdAt");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_teamLeadId_fkey" FOREIGN KEY ("teamLeadId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_tasks" ADD CONSTRAINT "sub_tasks_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_tasks" ADD CONSTRAINT "sub_tasks_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_tasks" ADD CONSTRAINT "sub_tasks_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_task_assignments" ADD CONSTRAINT "sub_task_assignments_subTaskId_fkey" FOREIGN KEY ("subTaskId") REFERENCES "sub_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_task_assignments" ADD CONSTRAINT "sub_task_assignments_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_task_assignments" ADD CONSTRAINT "sub_task_assignments_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_task_dependencies" ADD CONSTRAINT "sub_task_dependencies_subTaskId_fkey" FOREIGN KEY ("subTaskId") REFERENCES "sub_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_task_dependencies" ADD CONSTRAINT "sub_task_dependencies_prerequisiteId_fkey" FOREIGN KEY ("prerequisiteId") REFERENCES "sub_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_ratings" ADD CONSTRAINT "performance_ratings_subTaskId_fkey" FOREIGN KEY ("subTaskId") REFERENCES "sub_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_ratings" ADD CONSTRAINT "performance_ratings_ratedUserId_fkey" FOREIGN KEY ("ratedUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_ratings" ADD CONSTRAINT "performance_ratings_ratedById_fkey" FOREIGN KEY ("ratedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_subTaskId_fkey" FOREIGN KEY ("subTaskId") REFERENCES "sub_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_subTaskId_fkey" FOREIGN KEY ("subTaskId") REFERENCES "sub_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

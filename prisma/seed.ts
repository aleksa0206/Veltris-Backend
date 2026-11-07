// Demo workspace for local development: `npm run seed`. Goes through the repositories, so task
// numbers, board positions and the activity log are produced exactly as by the API.
// Every demo account uses the password `password123`.
import bcrypt from 'bcrypt';
import { TaskPriority, TaskStatus } from '@prisma/client';
import { prisma } from '../src/config/prismaClient';
import * as commentRepository from '../src/repositories/commentRepository';
import * as projectRepository from '../src/repositories/projectRepository';
import * as taskRepository from '../src/repositories/taskRepository';
import * as workspaceRepository from '../src/repositories/workspaceRepository';
import { addDays, todayUtc } from '../src/utils/dates';

const PEOPLE = [
  ['Ana', 'Petrović', 'ana@veltris.dev'],
  ['Marko', 'Jovanović', 'marko@veltris.dev'],
  ['Jelena', 'Nikolić', 'jelena@veltris.dev'],
  ['Stefan', 'Ilić', 'stefan@veltris.dev'],
  ['Ivana', 'Đorđević', 'ivana@veltris.dev'],
] as const;

type Seed = [string, TaskStatus, TaskPriority, number | null, number | null, string[]?];

// title, status, priority, assignee index, due in days from today, subtasks
const PROJECTS: Array<{
  key: string;
  name: string;
  description: string;
  status: 'Active' | 'OnHold' | 'Completed';
  lead: number;
  start: number;
  target: number;
  tasks: Seed[];
}> = [
  {
    key: 'WEB',
    name: 'Website relaunch',
    description: 'New marketing site: information architecture, content migration and launch.',
    status: 'Active',
    lead: 0,
    start: -40,
    target: 24,
    tasks: [
      ['Finalize navigation structure', 'Done', 'High', 0, -12],
      [
        'Migrate case studies to the new CMS',
        'InProgress',
        'Medium',
        2,
        3,
        ['Export old entries', 'Map fields to new content types', 'Review migrated pages'],
      ],
      ['Pricing page copy review', 'InReview', 'High', 1, 1],
      ['Fix layout shift on the hero section', 'Todo', 'Urgent', 3, -2],
      ['Set up redirects for retired URLs', 'Todo', 'High', 3, 6],
      ['Cookie consent banner', 'Todo', 'Medium', null, 10],
      ['Accessibility audit of templates', 'Backlog', 'Medium', 4, null],
      ['Localized landing pages (DE, FR)', 'Backlog', 'Low', null, null],
      ['Performance budget in CI', 'InProgress', 'Medium', 3, 8],
      [
        'Launch checklist',
        'Todo',
        'High',
        0,
        20,
        ['DNS cut-over plan', 'Analytics verification', 'Rollback plan'],
      ],
    ],
  },
  {
    key: 'MOB',
    name: 'Mobile app 2.0',
    description: 'Offline mode, redesigned task list and push notifications.',
    status: 'Active',
    lead: 1,
    start: -60,
    target: 45,
    tasks: [
      ['Offline sync conflict resolution', 'InProgress', 'Urgent', 1, 4],
      ['Push notification preferences', 'InReview', 'Medium', 4, 2],
      ['Redesign task list for small screens', 'Done', 'High', 2, -20],
      ['Crash on resume from background (Android 15)', 'Todo', 'Urgent', 1, -1],
      ['Biometric sign-in', 'Backlog', 'Medium', null, null],
      ['App Store screenshots', 'Todo', 'Low', 2, 30],
      ['Reduce cold start time', 'InProgress', 'High', 3, 12],
      ['Beta feedback triage', 'Todo', 'Medium', 0, 5],
    ],
  },
  {
    key: 'OPS',
    name: 'Infrastructure migration',
    description: 'Move production workloads to the new cluster with zero downtime.',
    status: 'OnHold',
    lead: 3,
    start: -30,
    target: 70,
    tasks: [
      ['Inventory of running services', 'Done', 'Medium', 3, -15],
      ['Database replication test', 'InProgress', 'High', 3, -5],
      ['Cost estimate for the new cluster', 'InReview', 'Medium', 0, 7],
      ['Runbook for the cut-over', 'Backlog', 'High', null, null],
    ],
  },
  {
    key: 'BRD',
    name: 'Brand refresh',
    description: 'Updated logo usage, type and colour guidelines.',
    status: 'Completed',
    lead: 2,
    start: -120,
    target: -10,
    tasks: [
      ['Logo usage guidelines', 'Done', 'High', 2, -40],
      ['Type scale and colour tokens', 'Done', 'Medium', 2, -30],
      ['Slide template', 'Done', 'Low', 4, -15],
    ],
  },
];

const COMMENTS: Array<[string, number, number, string]> = [
  ['WEB', 2, 2, 'About a third of the entries are migrated. Video embeds need a new block type.'],
  ['WEB', 2, 0, 'Let’s add the block type now rather than patching each page afterwards.'],
  ['WEB', 4, 3, 'Reproduced on Safari only. Image dimensions are missing on the hero.'],
  ['MOB', 1, 1, 'Last-write-wins is not enough for checklists; merging per item instead.'],
  ['MOB', 1, 4, 'Agreed. I can test it on the flaky subway connection tomorrow.'],
  ['MOB', 4, 0, 'Seen by 30+ beta users. Top priority for this week.'],
];

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('The demo seed must not run in production');
  }
  if (await prisma.user.findUnique({ where: { email: PEOPLE[0][2] } })) {
    console.log('Demo data already exists; nothing to do.');
    return;
  }

  const passwordHash = await bcrypt.hash('password123', 10);
  const users = [];
  for (const [firstName, lastName, email] of PEOPLE) {
    users.push(await prisma.user.create({ data: { firstName, lastName, email, passwordHash } }));
  }
  const workspace = await workspaceRepository.createWorkspace('Northwind Labs', users[0]!.id);
  for (const [index, user] of users.slice(1).entries()) {
    await workspaceRepository.addMember(workspace.id, user.id, index === 0 ? 'Admin' : 'Member');
  }

  const today = todayUtc();
  const tasksByKey = new Map<string, number[]>();
  for (const project of PROJECTS) {
    const created = await projectRepository.createProject(workspace.id, {
      key: project.key,
      name: project.name,
      description: project.description,
      status: project.status,
      leadId: users[project.lead]!.id,
      startDate: addDays(today, project.start),
      targetDate: addDays(today, project.target),
    });
    const ids: number[] = [];
    for (const [title, status, priority, assignee, due, subtasks = []] of project.tasks) {
      const reporter = users[project.lead]!.id;
      const assigneeId = assignee === null ? null : users[assignee]!.id;
      // Created as Todo and then moved, so the history shows a real status change.
      const task = await taskRepository.createTask(
        created.id,
        {
          title,
          description: null,
          status: status === 'Backlog' ? 'Backlog' : 'Todo',
          priority,
          assigneeId,
          dueDate: due === null ? null : addDays(today, due),
        },
        null,
        reporter
      );
      if (status !== 'Backlog' && status !== 'Todo') {
        await taskRepository.updateTask(task.id, { status }, assigneeId ?? reporter);
      }
      for (const [index, subtask] of subtasks.entries()) {
        await taskRepository.createTask(
          created.id,
          {
            title: subtask,
            description: null,
            status: index === 0 ? 'Done' : 'Todo',
            priority: 'None',
            assigneeId,
            dueDate: null,
          },
          task.id,
          reporter
        );
      }
      ids.push(task.id);
    }
    tasksByKey.set(project.key, ids);
  }

  for (const [key, number, author, body] of COMMENTS) {
    const taskId = tasksByKey.get(key)![number - 1]!;
    await commentRepository.createComment(taskId, users[author]!.id, body);
  }

  console.log(`Seeded "${workspace.name}". Sign in as ${PEOPLE[0][2]} / password123.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

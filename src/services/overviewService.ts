import * as activityRepository from '../repositories/activityRepository';
import * as projectRepository from '../repositories/projectRepository';
import * as taskRepository from '../repositories/taskRepository';
import { addDays } from '../utils/dates';
import { requireMember } from './workspaceService';

const MY_TASKS = 12;
const PROJECTS = 8;
const ACTIVITY = 15;

/**
 * Everything the workspace overview needs in one request. `today` is the user's calendar day,
 * which can differ from the server's UTC day.
 */
export async function getOverview(workspaceId: number, userId: number, today: Date) {
  await requireMember(workspaceId, userId);
  const open = { workspaceId, topLevel: false, open: true };
  const [myTasks, projects, activity, openCount, overdue, dueWithinWeek, completedThisWeek] =
    await Promise.all([
      taskRepository.findAllTasks({ ...open, assigneeId: userId }, 'due', {
        skip: 0,
        take: MY_TASKS,
      }),
      projectRepository.findAllProjects(
        workspaceId,
        { status: ['Active', 'OnHold'] },
        'targetDate',
        today,
        { skip: 0, take: PROJECTS }
      ),
      activityRepository.findRecentActivity(workspaceId, ACTIVITY),
      taskRepository.countTasks(open),
      taskRepository.countTasks({ ...open, dueBefore: today }),
      taskRepository.countTasks({ ...open, dueBefore: addDays(today, 7) }),
      taskRepository.countTasks({
        workspaceId,
        topLevel: false,
        status: ['Done'],
        completedSince: addDays(today, -6),
      }),
    ]);

  return {
    myTasks: myTasks.data,
    myTasksTotal: myTasks.total,
    projects: projects.data,
    projectsTotal: projects.total,
    activity,
    stats: {
      open: openCount,
      overdue,
      // Today through the next six days; what is already overdue is counted separately.
      dueThisWeek: dueWithinWeek - overdue,
      completedThisWeek,
    },
  };
}

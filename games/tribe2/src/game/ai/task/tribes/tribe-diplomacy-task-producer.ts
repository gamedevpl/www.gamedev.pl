import { UpdateContext } from '../../../world-types';
import { TaskType, Task } from '../task-types';
import { AI_DIPLOMACY_CHECK_INTERVAL_HOURS } from '../../../ai-consts';
import { IndexedWorldState } from '../../../world-index/world-index-types';
import { Blackboard } from '../../behavior-tree/behavior-tree-blackboard';

/**
 * Produces diplomacy tasks at the tribe level.
 * This function is called periodically to ensure tribe leaders evaluate
 * their relationships with other tribes.
 */
export function produceTribeDiplomacyTasks(context: UpdateContext): void {
  const { gameState } = context;
  const indexedState = gameState as IndexedWorldState;

  // 1. Identify all tribe leaders
  const allHumans = indexedState.search.human.all();
  const leaders = allHumans.filter((h) => h.leaderId === h.id);

  for (const leader of leaders) {
    if (!leader.aiBlackboard) continue;

    const taskId = `diplomacy-${leader.id}`;

    // 2. Check if the task already exists
    if (gameState.tasks[taskId]) {
      continue;
    }

    // 3. Check the cooldown from the blackboard
    const lastCheckTime = Blackboard.get<number>(leader.aiBlackboard, 'lastDiplomacyCheckTime') ?? -Infinity;
    if (gameState.time - lastCheckTime < AI_DIPLOMACY_CHECK_INTERVAL_HOURS) {
      continue;
    }

    // 4. Create a new diplomacy task for the leader
    const diplomacyTask: Task = {
      id: taskId,
      type: TaskType.HumanDiplomacy,
      position: leader.position,
      creatorEntityId: leader.id,
      validUntilTime: gameState.time + AI_DIPLOMACY_CHECK_INTERVAL_HOURS,
    };

    gameState.tasks[taskId] = diplomacyTask;
  }
}

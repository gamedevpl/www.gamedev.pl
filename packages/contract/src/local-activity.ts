export type LocalActivity = {
  runId: string;
  agent: string;
  phase: 'preparing' | 'editing' | 'permission' | 'interactive' | 'verifying' | 'ready' | 'failed' | 'stopped';
  at: string;
};

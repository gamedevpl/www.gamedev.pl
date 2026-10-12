const DELIVERY_STAGES = ['sources', 'verify', 'recheck', 'session', 'staged', 'upload', 'send', 'checkout'] as const;

export function deliveryProgress(report?: (message: string) => void) {
  return (stage: (typeof DELIVERY_STAGES)[number], message: string) => {
    report?.(`[${DELIVERY_STAGES.indexOf(stage) + 1}/${DELIVERY_STAGES.length}] ${message}`);
  };
}

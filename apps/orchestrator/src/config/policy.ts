export const POLICY = {
    confidence: { execute: 0.80, stageMin: 0.60 },
    fab: { autoExecuteBudgetPct: 0.03 }, // 3% of remaining FAB
    autoSwapInjuryOut: true,
    approvals: { requireAboveAutoRules: true },
  };
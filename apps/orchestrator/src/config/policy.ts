export const POLICY = {
  confidence: { execute: 0.8, stageMin: 0.6 },
  fab: { autoExecuteBudgetPct: 0.03 }, // 3% of remaining FAB
  autoSwapInjuryOut: true,
  approvals: { requireAboveAutoRules: true },
};

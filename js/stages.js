export const STAGES = ['prospect', 'qualified', 'proposal', 'negotiation', 'closing', 'won', 'lost'];

export const STAGE_PROBABILITY = {
  prospect: 10,
  qualified: 25,
  proposal: 50,
  negotiation: 65,
  closing: 85,
  won: 100,
  lost: 0,
};

export const LOST_REASONS = ['Price', 'Competitor', 'No Budget', 'No Decision', 'Timing', 'Other'];

export const ACTIVE_STAGES = ['prospect', 'qualified', 'proposal', 'negotiation', 'closing'];

export function stageIndex(stage) {
  return STAGES.indexOf(stage);
}

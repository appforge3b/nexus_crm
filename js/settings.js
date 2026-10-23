import { STAGES } from './stages.js';

const STAGE_LABELS = {
  prospect: 'Prospect',
  qualified: 'Qualified',
  proposal: 'Proposal',
  negotiation: 'Negotiation',
  closing: 'Closing',
  won: 'Won',
  lost: 'Lost',
};

export function defaultSettings() {
  return {
    userName: 'there',
    currency: '₹',
    countryCode: '+91',
    voiceLang: 'en-IN',
    stages: STAGES.map((id) => ({ id, name: STAGE_LABELS[id] })),
  };
}

export function renameStage(settings, stageId, name) {
  const trimmed = String(name ?? '').trim();
  if (!trimmed) throw new Error('Stage name is required');
  const stages = settings.stages.map((stage) => ({ ...stage }));
  const stage = stages.find((item) => item.id === stageId);
  if (!stage) throw new Error(`unknown stage: ${stageId}`);
  stage.name = trimmed;
  return { ...settings, stages };
}

export function stageLabel(settings, stageId) {
  return settings?.stages?.find((stage) => stage.id === stageId)?.name ?? stageId;
}

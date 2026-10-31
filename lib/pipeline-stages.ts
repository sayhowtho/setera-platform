// Shared source of truth for calls.pipeline_stage labels/colors — used by
// the Pipeline board/list and by DashboardV2's real-data "Recent Leads".
export const PIPELINE_STAGES = [
  { id: 'new', label: 'Call Captured', color: '#6b7280', accent: '#f3f4f6' },
  { id: 'called_back', label: 'Called Back', color: '#3b82f6', accent: '#dbeafe' },
  { id: 'estimate_booked', label: 'Estimate Booked', color: '#8b5cf6', accent: '#ede9fe' },
  { id: 'estimate_done', label: 'Estimate Done', color: '#f59e0b', accent: '#fef3c7' },
  { id: 'job_signed', label: 'Job Signed', color: '#f97316', accent: '#ffedd5' },
  { id: 'install_started', label: 'Install Started', color: '#06b6d4', accent: '#cffafe' },
  { id: 'install_completed', label: 'Install Completed', color: '#10b981', accent: '#d1fae5' },
  { id: 'income_collected', label: 'Income Collected', color: '#00d4aa', accent: '#ccfbf1' },
];

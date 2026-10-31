// calls.status color + label, shared by the client portal and High Table so
// both show the same thing for the same call. Values are what emily-webhook
// writes: red = urgent, yellow = follow up, green = captured, blue = in
// progress (set by the client portal).
export function getStatusColor(status: string) {
  if (status === 'red') return '#ef4444';
  if (status === 'yellow') return '#f59e0b';
  if (status === 'green') return '#00d4aa';
  if (status === 'blue') return '#3b82f6';
  return '#6b7280';
}

export function getStatusLabel(status: string) {
  if (status === 'red') return 'Urgent';
  if (status === 'yellow') return 'Follow Up';
  if (status === 'green') return 'Captured';
  if (status === 'blue') return 'In Progress';
  return status;
}

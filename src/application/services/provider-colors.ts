/**
 * Generate consistent colors for providers based on their ID
 * This ensures the same provider always gets the same color
 */

// Predefined color themes for providers
const PROVIDER_COLORS = [
  { bg: '#e3f2fd', border: '#2196f3', text: '#1565c0' }, // Blue
  { bg: '#f3e5f5', border: '#9c27b0', text: '#7b1fa2' }, // Purple
  { bg: '#e8f5e9', border: '#4caf50', text: '#388e3c' }, // Green
  { bg: '#fff3e0', border: '#ff9800', text: '#f57c00' }, // Orange
  { bg: '#fce4ec', border: '#e91e63', text: '#c2185b' }, // Pink
  { bg: '#e0f2f1', border: '#009688', text: '#00796b' }, // Teal
  { bg: '#fbe9e7', border: '#ff5722', text: '#d84315' }, // Deep Orange
  { bg: '#e8eaf6', border: '#3f51b5', text: '#303f9f' }, // Indigo
  { bg: '#fff8e1', border: '#ffc107', text: '#ffa000' }, // Amber
  { bg: '#e0f7fa', border: '#00bcd4', text: '#0097a7' }, // Cyan
  { bg: '#f1f8e9', border: '#8bc34a', text: '#689f38' }, // Light Green
  { bg: '#efebe9', border: '#795548', text: '#5d4037' }, // Brown
] as const

/**
 * Get a consistent color index for a provider ID
 */
function getColorIndex(providerId: string): number {
  let hash = 0
  for (let i = 0; i < providerId.length; i++) {
    const char = providerId.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return Math.abs(hash) % PROVIDER_COLORS.length
}

/**
 * Get color theme for a provider
 */
export function getProviderColor(providerId: string) {
  const index = getColorIndex(providerId)
  return PROVIDER_COLORS[index]
}

/**
 * Get CSS style object for provider message
 */
export function getProviderMessageStyle(providerId: string): React.CSSProperties {
  const colors = getProviderColor(providerId)
  return {
    backgroundColor: colors.bg,
    borderLeft: `4px solid ${colors.border}`,
  }
}

/**
 * Get CSS style for provider badge
 */
export function getProviderBadgeStyle(providerId: string): React.CSSProperties {
  const colors = getProviderColor(providerId)
  return {
    backgroundColor: colors.border,
    color: '#fff',
  }
}

/**
 * Get provider display name with nickname
 */
export function getProviderDisplayName(nickname?: string, name?: string): string {
  if (nickname) return nickname
  if (name) return name
  return 'AI'
}

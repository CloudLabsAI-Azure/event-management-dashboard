/**
 * Utility functions for sanitizing and formatting dates
 */

/** Date fields commonly used across the application */
export const DATE_FIELDS = ['lastTestDate', 'eventDate', 'sessionDate', 'approvalDate'] as const;

export type DateField = typeof DATE_FIELDS[number];

/**
 * Sanitize date fields - convert empty strings to null for proper data type handling
 * This prevents Power BI and other tools from having type conversion issues
 * 
 * @param item - Object containing date fields
 * @param fields - Array of field names to sanitize (defaults to all common date fields)
 * @returns New object with sanitized date fields
 */
export const sanitizeDates = <T extends Record<string, any>>(
  item: T,
  fields: readonly string[] = DATE_FIELDS
): T => {
  const sanitized = { ...item };
  for (const field of fields) {
    if (sanitized[field] === '' || sanitized[field] === undefined) {
      (sanitized as any)[field] = null;
    }
  }
  return sanitized;
};

/**
 * Format a date string for display (MM/DD/YYYY format)
 * 
 * @param dateString - ISO date string or similar
 * @returns Formatted date string or empty string if invalid
 */
export const formatDateDisplay = (dateString: string | null | undefined): string => {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric'
    });
  } catch {
    return '';
  }
};

/**
 * Format a date for input fields (YYYY-MM-DD format)
 * 
 * @param dateString - Date string in any format
 * @returns Date in YYYY-MM-DD format for input[type="date"]
 */
export const formatDateForInput = (dateString: string | null | undefined): string => {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    return date.toISOString().split('T')[0];
  } catch {
    return '';
  }
};

/**
 * Check if a date is in the past
 * 
 * @param dateString - Date string to check
 * @returns true if date is before today
 */
export const isPastDate = (dateString: string | null | undefined): boolean => {
  if (!dateString) return false;
  try {
    const date = new Date(dateString);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);
    return date < today;
  } catch {
    return false;
  }
};

/**
 * Check if a date is within a given number of days from today
 * 
 * @param dateString - Date string to check
 * @param days - Number of days from today
 * @returns true if date is between today and (today + days)
 */
export const isWithinDays = (dateString: string | null | undefined, days: number): boolean => {
  if (!dateString) return false;
  try {
    const date = new Date(dateString);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);
    
    const futureDate = new Date(today);
    futureDate.setDate(futureDate.getDate() + days);
    
    return date >= today && date <= futureDate;
  } catch {
    return false;
  }
};

/**
 * Get relative time description (e.g., "2 days ago", "in 3 weeks")
 * 
 * @param dateString - Date string
 * @returns Human-readable relative time
 */
export const getRelativeTime = (dateString: string | null | undefined): string => {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays === -1) return 'Yesterday';
    if (diffDays > 0 && diffDays <= 7) return `In ${diffDays} days`;
    if (diffDays < 0 && diffDays >= -7) return `${Math.abs(diffDays)} days ago`;
    if (diffDays > 7 && diffDays <= 30) return `In ${Math.ceil(diffDays / 7)} weeks`;
    if (diffDays < -7 && diffDays >= -30) return `${Math.ceil(Math.abs(diffDays) / 7)} weeks ago`;
    
    return formatDateDisplay(dateString);
  } catch {
    return '';
  }
};

export default {
  sanitizeDates,
  formatDateDisplay,
  formatDateForInput,
  isPastDate,
  isWithinDays,
  getRelativeTime,
  DATE_FIELDS
};

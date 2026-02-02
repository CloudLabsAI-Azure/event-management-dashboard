import api from '@/lib/api'

/**
 * Service to check for duplicate event IDs across all data sources
 * Uses the optimized backend endpoint for better performance
 */
export const checkDuplicateEventId = async (
  eventId: string, 
  excludeSr?: number | string,
  excludeType?: string
): Promise<{ isDuplicate: boolean; existsIn: string[] }> => {
  if (!eventId || eventId.trim() === '' || eventId.trim().toUpperCase() === 'TBD') {
    return { isDuplicate: false, existsIn: [] };
  }

  try {
    // Use the optimized backend endpoint (single API call instead of multiple)
    const params = new URLSearchParams();
    params.append('eventId', eventId.trim());
    if (excludeSr) params.append('excludeSr', String(excludeSr));
    if (excludeType === 'track') params.append('excludeResource', 'tracks');
    
    const res = await api.get(`/api/check-duplicate-eventid?${params.toString()}`);
    
    return {
      isDuplicate: res.data?.isDuplicate || false,
      existsIn: res.data?.existsIn || []
    };
  } catch (error) {
    console.error('Error checking duplicate event ID:', error);
    return { isDuplicate: false, existsIn: [] };
  }
};

export default { checkDuplicateEventId };

import api from '@/lib/api'

/**
 * Service to check for duplicate event IDs across all data sources
 */
export const checkDuplicateEventId = async (
  eventId: string, 
  excludeSr?: number | string,
  excludeType?: string
): Promise<{ isDuplicate: boolean; existsIn: string[] }> => {
  if (!eventId || eventId.trim() === '' || eventId.trim().toUpperCase() === 'TBD') {
    return { isDuplicate: false, existsIn: [] };
  }

  const normalizedEventId = eventId.trim().toLowerCase();
  const existsIn: string[] = [];

  try {
    // Check catalog (includes all types: catalog, tttSession, customLabRequest, roadmapItem)
    const catalogRes = await api.get('/api/catalog');
    const catalogItems = Array.isArray(catalogRes.data) ? catalogRes.data : [];

    for (const item of catalogItems) {
      const itemEventId = (item.eventId || '').trim().toLowerCase();
      if (itemEventId && itemEventId === normalizedEventId) {
        // Skip if this is the same item being edited (sr is unique in the catalog array)
        if (excludeSr && String(item.sr) === String(excludeSr)) {
          continue;
        }
        
        // Determine which page this item belongs to
        if (item.type === 'tttSession') {
          if (!existsIn.includes('TTT Sessions')) existsIn.push('TTT Sessions');
        } else if (item.type === 'customLabRequest') {
          if (!existsIn.includes('Custom Lab Requests')) existsIn.push('Custom Lab Requests');
        } else if (item.type === 'roadmapItem') {
          if (!existsIn.includes('Lab Development')) existsIn.push('Lab Development');
        } else {
          if (!existsIn.includes('Catalog Health')) existsIn.push('Catalog Health');
        }
      }
    }

    // Also check tracks (Top25)
    const tracksRes = await api.get('/api/tracks');
    const tracks = Array.isArray(tracksRes.data) ? tracksRes.data : [];

    for (const track of tracks) {
      const trackEventId = (track.eventId || '').trim().toLowerCase();
      if (trackEventId && trackEventId === normalizedEventId) {
        // Skip if this is the same item being edited
        if (excludeSr && String(track.sr) === String(excludeSr) && excludeType === 'track') {
          continue;
        }
        if (!existsIn.includes('Top 25 Tracks')) existsIn.push('Top 25 Tracks');
      }
    }

    return {
      isDuplicate: existsIn.length > 0,
      existsIn
    };
  } catch (error) {
    console.error('Error checking duplicate event ID:', error);
    return { isDuplicate: false, existsIn: [] };
  }
};

export default { checkDuplicateEventId };

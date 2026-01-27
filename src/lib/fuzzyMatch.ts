/**
 * Fuzzy matching utility for comparing track names with GitHub folder names
 */

/**
 * Normalize a string for comparison
 * - Convert to lowercase
 * - Remove special characters
 * - Remove extra whitespace
 */
export function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculate similarity score between two strings (0-100)
 * Uses a combination of:
 * - Substring matching
 * - Word overlap
 * - Length similarity
 */
export function calculateSimilarity(str1: string, str2: string): number {
  const normalized1 = normalizeString(str1);
  const normalized2 = normalizeString(str2);

  // Exact match
  if (normalized1 === normalized2) return 100;

  // Check if one is substring of other
  if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) {
    const longer = Math.max(normalized1.length, normalized2.length);
    const shorter = Math.min(normalized1.length, normalized2.length);
    return Math.round((shorter / longer) * 95); // 95 for substring match
  }

  // Word-based matching
  const words1 = normalized1.split(' ').filter(w => w.length > 2); // ignore short words
  const words2 = normalized2.split(' ').filter(w => w.length > 2);

  if (words1.length === 0 || words2.length === 0) return 0;

  // Count matching words
  let matchingWords = 0;
  const checkedWords = new Set<string>();

  for (const word1 of words1) {
    for (const word2 of words2) {
      if (!checkedWords.has(word2) && (word1 === word2 || word1.includes(word2) || word2.includes(word1))) {
        matchingWords++;
        checkedWords.add(word2);
        break;
      }
    }
  }

  // Calculate score based on word overlap
  const totalWords = Math.max(words1.length, words2.length);
  const wordScore = (matchingWords / totalWords) * 100;

  return Math.round(wordScore);
}

/**
 * Find best matching GitHub folder for a track name
 */
export interface MatchResult {
  folderName: string;
  folderUrl: string;
  score: number;
}

export function findBestMatch(
  trackName: string,
  githubFolders: Array<{ name: string; url: string }>,
  threshold: number = 60
): MatchResult | null {
  let bestMatch: MatchResult | null = null;

  for (const folder of githubFolders) {
    const score = calculateSimilarity(trackName, folder.name);
    
    if (score >= threshold && (!bestMatch || score > bestMatch.score)) {
      bestMatch = {
        folderName: folder.name,
        folderUrl: folder.url,
        score
      };
    }
  }

  return bestMatch;
}

/**
 * Find all matches above threshold (for showing alternatives)
 */
export function findAllMatches(
  trackName: string,
  githubFolders: Array<{ name: string; url: string }>,
  threshold: number = 60
): MatchResult[] {
  const matches: MatchResult[] = [];

  for (const folder of githubFolders) {
    const score = calculateSimilarity(trackName, folder.name);
    
    if (score >= threshold) {
      matches.push({
        folderName: folder.name,
        folderUrl: folder.url,
        score
      });
    }
  }

  // Sort by score descending
  return matches.sort((a, b) => b.score - a.score);
}

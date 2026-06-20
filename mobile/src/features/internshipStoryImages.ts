/**
 * GAOEX internship story — photo-only remote sources (landscape/portrait matched to slots).
 * Posters, flyers, and letter scans intentionally excluded.
 *
 * Toggle off: set ENABLE_INTERNSHIP_STORY_IMAGES to false (placeholders return).
 * Sources: https://www.gacademyofexcellence.com
 */

export const ENABLE_INTERNSHIP_STORY_IMAGES = true;

const BASE = 'https://www.gacademyofexcellence.com/wp-content/uploads';

/** Landscape photos (~1.5–1.8) for hero / inline / compact / feature slots */
export const INTERNSHIP_STORY_IMAGES = {
  heroMission: `${BASE}/2023/02/2.jpg`,
  globalReach: `${BASE}/2023/03/c03b99b1-6240-4de9-830b-cb6bc2504422.jpg`,
  educationInAction: `${BASE}/2023/02/269744064_139355831795305_558961746601961972_n.jpg`,
  researchEvaluation: `${BASE}/2023/11/374204150_7369859069708843_1353280527567634800_n-1.jpg`,
  partnershipsWorldwide: `${BASE}/2023/02/Schools-of-Salem-Diocese.jpg`,
  regionsFootprint: `${BASE}/2023/11/374559906_7369857959708954_1446275755387955024_n.jpg`,
  indiaPrograms: `${BASE}/2023/02/240606225_110571731340382_7905587785335448214_n.jpg`,
  usaLeadership: `${BASE}/2024/08/448932657_8553917644636307_622999836428493452_n-1.jpg`,
  studentsEducators: `${BASE}/2023/11/DIET-Ranipet.jpeg`,
  programsOverview: `${BASE}/2023/11/374523924_7369860959708654_4699505632925106949_n.jpg`,
  curriculumCompetitions: `${BASE}/2023/02/Memory-Test.jpeg`,
  studentWorkshops: `${BASE}/2023/11/374576679_7369861919708558_7700204288816810840_n.jpg`,
  /** Portrait 3:4 */
  internsHigherEd: `${BASE}/2024/08/Introduction-to-Artificial-Intelligence-Workshop.jpg`,
  internshipCulture: `${BASE}/2023/11/374576679_7369861919708558_7700204288816810840_n.jpg`,
  impactAtGlance: `${BASE}/2023/11/374172851_7369857943042289_731168785013415504_n.jpg`,
  studentReach: `${BASE}/2023/11/374281202_7369859583042125_2618190225782098919_n.jpg`,
  awardsRecognition: `${BASE}/2024/10/459077912_549271241007223_6684145068795973218_n.jpg`,
  /** Portrait — group until a high-res founder portrait is available */
  leadership: `${BASE}/2025/09/WhatsApp-Image-2025-09-15-at-9.00.44-AM.jpeg`,
  /** Ultra-wide landscape for 2:1 inline */
  policyAlignment: `${BASE}/2024/10/457792569_542174955050185_7801563462140378005_n.jpg`,
} as const;

export function storyImageUri(key: keyof typeof INTERNSHIP_STORY_IMAGES): string | undefined {
  if (!ENABLE_INTERNSHIP_STORY_IMAGES) return undefined;
  return INTERNSHIP_STORY_IMAGES[key];
}

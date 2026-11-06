export type NavigationUpdateSnapshot = {
  academicInbox: number;
  calendarConflicts: number;
  calendarOperations: number;
  connectionErrors: number;
  graduateCandidates: number;
  internshipCandidates: number;
  pendingInbox: number;
  sourceErrors: number;
  unreadNotifications: number;
};

export function deriveNavigationUpdateHrefs(snapshot: NavigationUpdateSnapshot) {
  const hrefs = new Set<string>();

  if (snapshot.internshipCandidates > 0) hrefs.add("/internships");
  if (snapshot.graduateCandidates > 0) hrefs.add("/graduate");
  if (snapshot.academicInbox > 0) hrefs.add("/academics");
  if (snapshot.pendingInbox > 0) hrefs.add("/inbox");
  if (snapshot.calendarConflicts + snapshot.calendarOperations > 0) hrefs.add("/calendar");
  if (snapshot.unreadNotifications > 0) hrefs.add("/review");
  if (snapshot.connectionErrors + snapshot.sourceErrors > 0) hrefs.add("/status");

  return hrefs;
}

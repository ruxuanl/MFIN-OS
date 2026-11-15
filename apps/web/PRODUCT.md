# MFin OS product context

<!-- impeccable:product-schema 1 -->

## Platform

web — responsive Next.js PWA for iPhone Safari and desktop browsers.

## Users and purpose

A single HKU MFin student managing coursework, internships and graduate recruitment. The default entry is a two-minute action brief. Success means fewer navigation steps and a clear next action.

## Constraints

Authoritative product truth remains [PRODUCT_SPEC.md](../../docs/PRODUCT_SPEC.md) and [DECISIONS.md](../../docs/DECISIONS.md). Today's redesign is explicitly authorized by the user on 2026-11-15, including layout changes and a GitHub PR, with design decisions delegated to the implementer.

Keep Today, Internships, Graduate Recruitment and Academics independent primary destinations. Gmail is read-only. New opportunities require user confirmation before tracking; applying remains a manual external action. Preserve permission enforcement, privacy lock, field locks, evidence, history and undo. No deployment or database change is needed for this UI task.

## Operating context

Chinese interface with original English source content. Desktop supports detailed tables; iPhone supports compact reading and one-handed navigation. Honor system dark mode, safe areas, reduced motion and keyboard access. Existing search supports opportunities, candidates and email summaries; do not claim other object types are searchable.

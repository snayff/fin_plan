---
feature: reduced-motion
status: implemented
priority: low
deferred: true
phase:
implemented_date: 2026-07-05
---

# Reduced Motion

## Intention
Users with vestibular disorders, motion sensitivity, or attention conditions need transitions and animations to be reduced or eliminated. Respecting the OS-level `prefers-reduced-motion` preference ensures the app is usable without causing discomfort.

## Description
All CSS transitions and animations check the `prefers-reduced-motion: reduce` media query. When the preference is set, animations are disabled (not slowed), with no loss of functionality.

## User Stories
- As a user with motion sensitivity, I want all animations disabled when I have set my OS preference so that the app does not cause discomfort.
- As a user, I want no functional degradation when animations are off so that I can still use every feature.

## Acceptance Criteria
- [ ] All CSS `transition` and `animation` declarations check `@media (prefers-reduced-motion: reduce)`
- [ ] Animations are disabled when the preference is set, not merely slowed
- [ ] Transitions used for directional slide, panel changes, and micro-interactions all respect the preference
- [ ] No feature or content is hidden behind an animation that would be skipped
- [ ] No JavaScript-driven animations bypass the media query check

## Open Questions
- [ ] Should a manual toggle in Settings override the OS preference for users who cannot change their OS settings?
- [ ] Is this implemented as a global CSS variable (e.g. `--motion-duration: 0ms`) or per-component overrides?

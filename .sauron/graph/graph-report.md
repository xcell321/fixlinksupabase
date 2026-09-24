# Codebase Knowledge Graph Architecture Report

Generated: 2026-09-22T23:06:10.872Z
Target: `C:\CAPSTONE\fixlinksupabase`

## 1. Executive Summary

- Total Monitored Source Files: 72
- Total AST Dependencies: 135
- Circular Dependency Cycles: 0
- God Modules (degree > 10): 3

## 2. God Modules Requiring Architecture Review

| Module | In-Degree | Out-Degree | Total Degree | Symbols |
| :--- | :--- | :--- | :--- | :--- |
| `Fixlinkmobile/mobile/src/theme.tsx` | 20 | 0 | 20 | 11 |
| `Fixlinkmobile/mobile/src/navigation/AppNavigator.tsx` | 1 | 17 | 18 | 1 |
| `Fixlinkmobile/mobile/src/screens/services/api.tsx` | 15 | 0 | 15 | 42 |

## 3. Circular Dependency Audit

Zero circular dependency cycles detected across analyzed modules.

## 4. Top Hub Modules by Fan-In (Incoming Dependencies)

| Module | In-Degree (Depended On By) |
| :--- | :--- |
| `Fixlinkmobile/mobile/src/theme.tsx` | 20 |
| `Fixlinkmobile/mobile/src/screens/services/api.tsx` | 15 |
| `Fixlinkmobile/backend/src/config/supabase.js` | 10 |
| `Fixlinkmobile/mobile/src/utils/applianceIcons.tsx` | 7 |
| `Fixlinkmobile/mobile/src/screens/services/locationIq.tsx` | 6 |
| `Fixlinkmobile/mobile/src/components/RequestPhoto.tsx` | 4 |
| `Fixlinkmobile/mobile/src/components/Skeleton.tsx` | 4 |
| `Fixlinkmobile/backend/src/middleware/requireAuth.js` | 3 |
| `Fixlinkmobile/backend/src/utils/geocode.js` | 3 |
| `Fixlinkmobile/backend/src/utils/serialize.js` | 3 |

## 5. Artifact Reference

- Full Node/Edge Graph Data: `.sauron/graph/graph.json`
- Interactive In-Browser Visualization: `.sauron/graph/graph.html`
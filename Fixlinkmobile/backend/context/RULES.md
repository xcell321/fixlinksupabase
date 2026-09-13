# Project Rules & Coding Standards — FixLink Mobile

## 1. Architecture & Code Organization
- **Separation of Concerns:** Keep business logic, UI components, and API service calls decoupled.
- **Mobile Navigation:** Follow role-based navigation flows defined in `mobile/src/navigation/AppNavigator.js`.
- **API Client:** Route all mobile backend requests through `mobile/src/services/api.js`.

## 2. Technology & Dependency Boundaries
- Mobile stack is strictly React Native / Expo SDK 57. Do not install unverified native modules without Expo config plugins.
- Backend runs Node.js / Express with Firebase Admin SDK.
- Do not introduce breaking schema changes without updating `context/SCHEMA.md`.

## 3. Quality & Safety
- Validate all user input on both client (form validation) and server before processing.
- Maintain absolute path references in agent workflows.
- No direct hardcoding of Firebase API credentials or secrets; use environment variables (`.env`).


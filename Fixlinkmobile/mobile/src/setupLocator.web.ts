// Web only. Metro picks this file for the web target, so the Locator overlay
// ships only to browsers. Native targets resolve `setupLocator.ts` instead.
import setupLocatorUI from '@locator/runtime';

if (__DEV__ && typeof document !== 'undefined') {
  setupLocatorUI();
}

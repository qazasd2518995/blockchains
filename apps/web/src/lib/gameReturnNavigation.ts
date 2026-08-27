import type { NavigateFunction } from 'react-router-dom';
import { isQmoneyRealm } from '@/lib/platformRealm';

/** Leave an embedded game without rendering an intermediate platform route. */
export function returnFromGame(navigate: NavigateFunction, target: string): void {
  if (isQmoneyRealm) {
    window.location.replace(target);
    return;
  }
  navigate(target, { replace: true });
}

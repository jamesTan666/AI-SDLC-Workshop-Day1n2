import { execSync } from 'child_process';
import path from 'path';

/** Seeds Singapore public holidays so calendar tests have data. */
export default function globalSetup(): void {
  execSync('npx tsx scripts/seed-holidays.ts', {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit',
  });
}

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { demo } from './index.js';
import { toSeedSql } from './sql.js';

const target = resolve(process.argv[2] ?? 'seed.sql');
writeFileSync(target, toSeedSql(demo));
console.log(
  `Wrote ${demo.sources.length} sources, ${demo.reports.length} reports and ${demo.devices.length} devices to ${target}`,
);

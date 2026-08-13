import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const apiDesignPath = process.env.API_DESIGN_PATH
  ?? (existsSync('/workspace/docs/design/api-design.md')
    ? '/workspace/docs/design/api-design.md'
    : fileURLToPath(new URL('../../../docs/design/api-design.md', import.meta.url)));
const exportRoutePath = fileURLToPath(new URL('../../app/api/v1/events/[id]/export/route.ts', import.meta.url));

describe('QA-BUG-070: canonical export contract', () => {
  it('harus mendokumentasikan POST asynchronous dengan job_id dan file_url', () => {
    const apiDesign = readFileSync(apiDesignPath, 'utf8');
    const exportSection = apiDesign.split('## 14. Event - Export Participants (Admin)')[1]?.split('\n---')[0] ?? '';

    expect(exportSection).toMatch(/\*\*Endpoint:\*\*\s*`POST \/api\/v1\/events\/\{id\}\/export`/);
    expect(exportSection).toMatch(/job_id/);
    expect(exportSection).toMatch(/file_url/);
    expect(exportSection).toMatch(/asynchronous/i);
  });

  it('harus mempertahankan hanya handler POST pada route pemicu job', () => {
    const routeSource = readFileSync(exportRoutePath, 'utf8');

    expect(routeSource).toMatch(/export async function POST/);
    expect(routeSource).not.toMatch(/export async function GET/);
  });
});

import type { VercelRequest, VercelResponse } from '@vercel/node';

const SERVER_NAME = 'french-legal-citations';
const SERVER_VERSION = '1.0.0';
const REPO_URL = 'https://github.com/Ansvar-Systems/France-law-mcp';

export default function handler(req: VercelRequest, res: VercelResponse) {
  const url = new URL(req.url ?? '/', `https://${req.headers.host}`);

  if (url.pathname === '/version' || url.searchParams.has('version')) {
    res.status(200).json({
      name: SERVER_NAME,
      version: SERVER_VERSION,
      node_version: process.version,
      transport: ['stdio', 'streamable-http'],
      capabilities: ['statutes', 'eu_cross_references'],
      tier: 'free',
      source_schema_version: '1.0',
      repo_url: REPO_URL,
      report_issue_url: `${REPO_URL}/issues/new?template=data-error.md`,
    });
    return;
  }

  res.status(200).json({
    status: 'ok',
    server: SERVER_NAME,
    version: SERVER_VERSION,
    uptime_seconds: Math.floor(process.uptime()),
    data_freshness: {
      max_age_days: 30,
      note: 'Serving bundled free-tier database',
    },
    capabilities: ['statutes', 'eu_cross_references'],
    tier: 'free',
  });
}

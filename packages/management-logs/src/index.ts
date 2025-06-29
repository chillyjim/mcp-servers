#!/usr/bin/env node

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { callManagementApi } from '@chkp/quantum-infra';
import { Settings } from '@chkp/quantum-infra';
import { Command } from 'commander';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const pkg = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../package.json'), 'utf-8')
);

process.env.CP_MCP_MAIN_PKG = `${pkg.name} v${pkg.version}`;


async function runApi(method: string, uri: string, data: Record<string, any>): Promise<Record<string, any>> {
  return await callManagementApi(method, uri, data);
}

const server = new McpServer({
  name: 'management-logs',
  version: '1.0.0',
  description: 'MCP server to interact with Management Logs objects on Check Point Products.'
});

// Show logs tool
server.tool(
  'show_logs',
  'Retrieve logs based on a given filter. It can ignore warnings if specified and can also run a new query. An example usage is to show logs with a new query that retrieves the top 10 logs based on the "blades" field.',
  {
    'ignore-warnings': z.boolean().optional(),
    // New query parameters
    'new-query': z.object({
      filter: z.string().optional(),
      'time-frame': z.enum(['last-7-days', 'last-hour', 'today', 'last-24-hours', 'yesterday', 'this-week', 'this-month', 'last-30-days', 'all-time', 'custom']).optional(),
      'custom-start': z.string().optional(),
      'custom-end': z.string().optional(),
      'max-logs-per-request': z.number().min(1).max(100).optional(),
      top: z.object({
        count: z.number().min(1).max(50),
        field: z.enum(['sources', 'destinations', 'services', 'actions', 'blades', 'origins', 'users', 'applications'])
      }).optional(),
      type: z.enum(['logs', 'audit']).optional(),
      'log-servers': z.array(z.string()).optional()
    }).optional(),
    // Alternative: query by ID for pagination
    'query-id': z.string().optional()
  },
  async (args: Record<string, unknown>, extra: any) => {
    const ignoreWarnings = typeof args['ignore-warnings'] === 'boolean' ? args['ignore-warnings'] : undefined;
    const newQuery = args['new-query'] as any;
    const queryId = typeof args['query-id'] === 'string' ? args['query-id'] : undefined;

    const params: Record<string, any> = {};
    
    if (ignoreWarnings !== undefined) {
      params['ignore-warnings'] = ignoreWarnings;
    }

    if (newQuery) {
      const newQueryParams: Record<string, any> = {};
      
      if (newQuery.filter) newQueryParams.filter = newQuery.filter;
      if (newQuery['time-frame']) newQueryParams['time-frame'] = newQuery['time-frame'];
      if (newQuery['custom-start']) newQueryParams['custom-start'] = newQuery['custom-start'];
      if (newQuery['custom-end']) newQueryParams['custom-end'] = newQuery['custom-end'];
      if (newQuery['max-logs-per-request']) newQueryParams['max-logs-per-request'] = newQuery['max-logs-per-request'];
      if (newQuery.top) newQueryParams.top = newQuery.top;
      if (newQuery.type) newQueryParams.type = newQuery.type;
      if (newQuery['log-servers']) newQueryParams['log-servers'] = newQuery['log-servers'];

      params['new-query'] = newQueryParams;
    }

    if (queryId) {
      params['query-id'] = queryId;
    }

    const resp = await callManagementApi('POST', 'show-logs', params);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

// Generic object tools
server.tool(
  'show_gateways_and_servers',
  'Retrieve multiple gateway and server objects with optional filtering and pagination. Use this to get the currently installed policies only gateways.',
  {
    filter: z.string().optional(),
    limit: z.number().optional().default(50),
    offset: z.number().optional().default(0),
    order: z.array(z.string()).optional(),
    details_level: z.string().optional(),
    domains_to_process: z.array(z.string()).optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const filter = typeof args.filter === 'string' ? args.filter : '';
    const limit = typeof args.limit === 'number' ? args.limit : 50;
    const offset = typeof args.offset === 'number' ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order as string[] : undefined;
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const domains_to_process = Array.isArray(args.domains_to_process) ? args.domains_to_process as string[] : undefined;
    const params: Record<string, any> = { limit, offset };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params['details-level'] = details_level;
    if (domains_to_process) params['domains-to-process'] = domains_to_process;
    const resp = await callManagementApi('POST', 'show-gateways-and-servers', params);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'show_objects',
  'Retrieve multiple generic objects with filtering and pagination. Can use type (e.g host, service-tcp, network, address-range...) to get objects of a certain type.',
  {
      uids: z.array(z.string()).optional(),
      filter: z.string().optional(),
      limit: z.number().optional().default(50),
      offset: z.number().optional().default(0),
      order: z.array(z.string()).optional(),
      details_level: z.string().optional(),
      domains_to_process: z.array(z.string()).optional(),
      type: z.string().optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const uids = Array.isArray(args.uids) ? args.uids as string[] : undefined;
      const filter = typeof args.filter === 'string' ? args.filter : '';
    const limit = typeof args.limit === 'number' ? args.limit : 50;
    const offset = typeof args.offset === 'number' ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order as string[] : undefined;
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const domains_to_process = Array.isArray(args.domains_to_process) ? args.domains_to_process as string[] : undefined;
    const type = typeof args.type === 'string' ? args.type : undefined;
    const params: Record<string, any> = { limit, offset };
    if ( uids ) params.uids = uids;
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params['details-level'] = details_level;
    if (domains_to_process) params['domains-to-process'] = domains_to_process;
    if (type) params.type = type;
    const resp = await callManagementApi('POST', 'show-objects', params);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

// Tool: show_object
server.tool(
  'show_object',
  'Retrieve a generic object by UID.',
  {
    uid: z.string()
  },
  async (args: Record<string, unknown>, extra: any) => {
      const uid = args.uid as string;
      const params: Record<string, any> = {}
      params.uid = uid
      params.details_level = 'full'
      const resp = await callManagementApi('POST', 'show-object', params);
      return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);


export { server };

const main = async () => {
const program = new Command();
program
  .option('--s1c-url <s1c url>', 'S1C URL')
  .option('--api-key <key>', 'API key')
  .option('--username <username>', 'Username for on-prem authentication', process.env.USERNAME)
  .option('--password <password>', 'Password for on-prem authentication', process.env.PASSWORD)
  .option('--management-host <host>', 'Management host (for on-prem)', process.env.MANAGEMENT_HOST)
  .option('--management-port <port>', 'Port for on-prem API', process.env.MANAGEMENT_PORT || '443')
  .option('--verbose', 'Enable verbose output', process.env.VERBOSE === 'true')
  .option('--debug', 'Enable debug mode');
program.parse(process.argv);
const options = program.opts();
Settings.setSettings(Settings.fromArgs(options));
const transport = new StdioServerTransport();
await server.connect(transport);
console.error('Management Logs MCP server running on stdio. Version:', pkg.version);
};
main().catch((error) => {
  console.error('Fatal error in main():', error);
  process.exit(1);
});

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Settings, callManagementApi } from '@chkp/quantum-infra';
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
  name: 'https-inspection',
  version: '1.0.0',
  description: 'MCP server to interact with HTTPS Inspection objects on Check Point Gateways.'
});

// HTTPS Inspection Tools

server.tool(
  'show_https_rule',
  'Retrieve an existing HTTPS Inspection rule using either the rule number or the unique identifier (UID) of the rule. It also allows you to specify the level of detail for the fields in the response, ranging from just the UID value to a fully detailed representation of the rule.',
  {
    uid: z.string().optional(),
    rule_number: z.string().optional(),
    layer: z.string().optional(),
    details_level: z.string().optional().default('standard'),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const uid = typeof args.uid === 'string' ? args.uid : undefined;
    const rule_number = typeof args.rule_number === 'string' ? args.rule_number : undefined;
    const layer = typeof args.layer === 'string' ? args.layer : undefined;
    const details_level = typeof args.details_level === 'string' ? args.details_level : 'standard';
    
    const params: Record<string, any> = {};
    if (uid) {
      params.uid = uid;
    } else if (rule_number) {
      params['rule-number'] = rule_number;
    } else {
      throw new Error('Either uid or rule_number must be provided');
    }
    if (layer) params.layer = layer;
    params['details-level'] = details_level;
    
    const resp = await callManagementApi('POST', 'show-https-rule', params);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'show_https_rulebase',
  'Retrieve the entire HTTPS Inspection Rules layer. It can filter the rules based on search criteria and provides a list of objects. The function allows you to set filter preferences, limit the number of results, and sort the results.',
  {
    uid: z.string().optional(),
    name: z.string().optional(),
    filter: z.string().optional(),
    limit: z.number().optional().default(50),
    offset: z.number().optional().default(0),
    order: z.array(z.object({ ASC: z.string().optional(), DESC: z.string().optional() })).optional(),
    package: z.string().optional(),
    details_level: z.string().optional().default('standard'),
    use_object_dictionary: z.boolean().optional(),
    dereference_group_members: z.boolean().optional(),
    show_membership: z.boolean().optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const uid = typeof args.uid === 'string' ? args.uid : undefined;
    const name = typeof args.name === 'string' ? args.name : undefined;
    const filter = typeof args.filter === 'string' ? args.filter : undefined;
    const limit = typeof args.limit === 'number' ? args.limit : 50;
    const offset = typeof args.offset === 'number' ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order : undefined;
    const package_name = typeof args.package === 'string' ? args.package : undefined;
    const details_level = typeof args.details_level === 'string' ? args.details_level : 'standard';
    const use_object_dictionary = typeof args.use_object_dictionary === 'boolean' ? args.use_object_dictionary : undefined;
    const dereference_group_members = typeof args.dereference_group_members === 'boolean' ? args.dereference_group_members : undefined;
    const show_membership = typeof args.show_membership === 'boolean' ? args.show_membership : undefined;
    
    const params: Record<string, any> = { limit, offset };
    if (uid) params.uid = uid;
    if (name) params.name = name;
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (package_name) params.package = package_name;
    params['details-level'] = details_level;
    if (use_object_dictionary !== undefined) params['use-object-dictionary'] = use_object_dictionary;
    if (dereference_group_members !== undefined) params['dereference-group-members'] = dereference_group_members;
    if (show_membership !== undefined) params['show-membership'] = show_membership;
    
    const resp = await callManagementApi('POST', 'show-https-rulebase', params);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'show_https_section',
  'Retrieve an existing HTTPS Inspection section using either the section name or UID and the layer name. It allows you to specify the level of detail for the fields in the response.',
  {
    uid: z.string().optional(),
    name: z.string().optional(),
    layer: z.string(),
    details_level: z.string().optional().default('standard'),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const uid = typeof args.uid === 'string' ? args.uid : undefined;
    const name = typeof args.name === 'string' ? args.name : undefined;
    const layer = args.layer as string;
    const details_level = typeof args.details_level === 'string' ? args.details_level : 'standard';
    
    if (!uid && !name) {
      throw new Error('Either uid or name must be provided');
    }
    
    const params: Record<string, any> = { layer };
    if (uid) {
      params.uid = uid;
    } else if (name) {
      params.name = name;
    }
    params['details-level'] = details_level;
    
    const resp = await callManagementApi('POST', 'show-https-section', params);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'show_https_layer',
  'Retrieve an existing HTTPS Inspection layer using the layer name or unique identifier. It allows you to specify the level of detail for the fields in the response, ranging from just the UID value to a fully detailed representation of the object.',
  {
    uid: z.string().optional(),
    name: z.string().optional(),
    details_level: z.string().optional().default('standard'),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const uid = typeof args.uid === 'string' ? args.uid : undefined;
    const name = typeof args.name === 'string' ? args.name : undefined;
    const details_level = typeof args.details_level === 'string' ? args.details_level : 'standard';
    
    if (!uid && !name) {
      throw new Error('Either uid or name must be provided');
    }
    
    const params: Record<string, any> = {};
    if (uid) {
      params.uid = uid;
    } else if (name) {
      params.name = name;
    }
    params['details-level'] = details_level;
    
    const resp = await callManagementApi('POST', 'show-https-layer', params);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'show_https_layers',
  'Retrieve all HTTPS Inspection layers. It allows you to filter the objects by a search expression, specify the maximum number of results, skip a certain number of initial results, and sort the results.',
  {
    filter: z.string().optional(),
    limit: z.number().optional().default(50),
    offset: z.number().optional().default(0),
    order: z.array(z.object({ ASC: z.string().optional(), DESC: z.string().optional() })).optional(),
    details_level: z.string().optional().default('standard'),
    domains_to_process: z.array(z.string()).optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const filter = typeof args.filter === 'string' ? args.filter : undefined;
    const limit = typeof args.limit === 'number' ? args.limit : 50;
    const offset = typeof args.offset === 'number' ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order : undefined;
    const details_level = typeof args.details_level === 'string' ? args.details_level : 'standard';
    const domains_to_process = Array.isArray(args.domains_to_process) ? args.domains_to_process as string[] : undefined;
    
    const params: Record<string, any> = { limit, offset };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    params['details-level'] = details_level;
    if (domains_to_process) params['domains-to-process'] = domains_to_process;
    
    const resp = await callManagementApi('POST', 'show-https-layers', params);
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
      const params: Record<string, any> = {};
      params.uid = uid;
      params.details_level = 'full';
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
console.error('HTTPS Inspection MCP server running on stdio. Version:', pkg.version);
};
main().catch((error) => {
  console.error('Fatal error in main():', error);
  process.exit(1);
});

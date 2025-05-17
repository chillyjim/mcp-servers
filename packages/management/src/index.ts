#!/usr/bin/env node

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { callManagementApi } from '@chkp/genai-mcp-server-infra';
import { Settings } from '@chkp/genai-mcp-server-infra';
import { Command } from 'commander';


const server = new McpServer({ name: 'Check Point Quantum Management' ,
    description:
        "MCP server to run commands on a Check Point Management. Use this to view policies and objects for Access, NAT and VPN.",
  version: '1.0.0'
});

// --- PROMPT RESOURCES ---
const SHOW_INSTALLED_POLICIES = `Please show me my installed policies per gateway. In order to see which policies are installed, you need to call show-gateways-and-servers with details-level set to 'full'.\nIf you already know the gateway name or uid, you can use the show-simple-gateway or show simple-cluster function with details-level set to 'full' to get the installed policy.\n`;

const SHOW_POLICIES_AND_RULEBASES = `In order to see which policies Exist, You need to call show-packages with details-level set to 'full'.\nIf You already know the package name or uid, You can use the show-package function with details-level set to 'full' to get the policy.\nI can see the access-layers in the response. You can call show-access-layer with details-level set to 'full' to get the access-layer details.\nFinally, to get all the rules in the access-layer, You can call show-access-rulebase to see all the rules in the access-layer.\nTo show threat-prevention or NAT rules, You can call show-threat-rulebase or show-nat-rulebase respectively.\n`;

const SHOW_RULE = `Please show me details for rule {RULE_REF}. In order to get a rule You must first know the package and relevant access-layer.\nIf You already know the package and access-layer name or uid You can call show-access-rulebase and show-access-rule.\nIf not, You need to first get the relevant package and access-layer by calling show-packages and show-access-layers.\nIf there is more that one access-layer or package, You need to ask the user which one to use.\n`;

const TOPOLOGY_VISUALIZATION = `Create a visual topology diagram of the Check Point gateway "{GATEWAY_NAME}" showing:\n1. All interfaces with their IP addresses, subnet masks, and security zones\n2. Networks connected to each interface\n3. Allowed traffic flows based on policy rules \n\nFirst gather gateway information with show_simple_gateway, then examine security zones with show_security_zones, identify policy layers with show_access_layers and analyze relevant rules with show_access_rulebase. \nAdd details from specific objects as needed using show_network, show_host, etc. \n\nCreate a comprehensive SVG visualization showing both the physical topology and logical policy flows.`;

const SOURCE_TO_DESTINATION = `The user is asking to know the possible paths from {SOURCE} to {DESTINATION}. To create a source-to-destination path, You need to gather the following information:\n1. The source and destination objects (hosts, networks, etc.)\n2. The relevant access layer and rules that apply to the traffic between these objects\n3. Any NAT rules that may affect the traffic flow\n4. The gateways involved in the path\n\nI can use the show_access_rulebase, show_nat_rulebase, and show_gateways_and_servers functions to gather this information.\nOnce You have all the necessary details, You can construct the path. You will explain my decision with objects and rules references and also create a visualization of the path if needed.`;

// --- PROMPTS ---
server.prompt(
  'show_gateways_prompt',
  {},
  () => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: SHOW_INSTALLED_POLICIES,
        },
      },
    ],
  })
);

server.prompt(
  'show_policies_prompt',
  {},
  () => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: SHOW_POLICIES_AND_RULEBASES,
        },
      },
    ],
  })
);

server.prompt(
  'show_rule_prompt',
  {
    rule_name: z.string().optional(),
    rule_number: z.string().optional(),
  },
  (args: Record<string, unknown>, extra: any) => {
    const ruleName = typeof args.rule_name === 'string' ? args.rule_name : '';
    const ruleNumber = typeof args.rule_number === 'string' ? args.rule_number : '';
    const rule_ref = ruleName || ruleNumber ? `${ruleName}${ruleName && ruleNumber ? ' / ' : ''}${ruleNumber}` : 'the rule';
    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: SHOW_RULE.replace('{RULE_REF}', rule_ref),
          },
        },
      ],
    };
  }
);



// server.prompt(
//   'gateway_topology_visualization_prompt',
//   { gateway: z.string() },
//   ({ gateway }) => ({
//     messages: [
//       {
//         role: 'user',
//         content: {
//           type: 'text',
//           text: TOPOLOGY_VISUALIZATION.replace('{GATEWAY_NAME}', gateway),
//         },
//       },
//     ],
//   })
// );

server.prompt(
  'source_to_destination_prompt',
  {
    source: z.string().optional(),
    destination: z.string().optional(),
  },
  (args: Record<string, unknown>, extra: any) => {
    const src = typeof args.source === 'string' ? args.source : 'All sources';
    const dst = typeof args.destination === 'string' ? args.destination : 'all destinations';
    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: SOURCE_TO_DESTINATION.replace('{SOURCE}', src).replace('{DESTINATION}', dst),
          },
        },
      ],
    };
  }
);



// --- TOOLS ---

server.tool(
  'show_access_rulebase',
  'Show the access rulebase for a given name or uid. Either name or uid is required, the other can be empty.',
  {
    name: z.string().optional().default(''),
    uid: z.string().optional().default(''),
    package: z.string().optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const name = typeof args.name === 'string' ? args.name : '';
    const uid = typeof args.uid === 'string' ? args.uid : '';
    const pkg = typeof args.package === 'string' ? args.package : undefined;
    const resp = await callManagementApi('POST', 'show-access-rulebase', { name, uid, package: pkg });
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'show_hosts',
  'Show the hosts in the management server.',
  {
    limit: z.number().optional().default(50),
    offset: z.number().optional().default(0),
    show_membership: z.boolean().optional().default(true),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const limit = typeof args.limit === 'number' ? args.limit : 50;
    const offset = typeof args.offset === 'number' ? args.offset : 0;
    const show_membership = typeof args.show_membership === 'boolean' ? args.show_membership : true;
    const resp = await callManagementApi('POST', 'show-hosts', { limit, offset, show_membership });
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'show_access_rule',
  'Show a specific rule in the access control layer.',
  {
    layer: z.string(),
    rule_number: z.number().optional(),
    uid: z.string().optional(),
    details_level: z.string().optional(),
    show_as_ranges: z.boolean().optional().default(false),
    show_hits: z.boolean().optional().default(false),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const layer = typeof args.layer === 'string' ? args.layer : '';
    const rule_number = typeof args.rule_number === 'number' ? args.rule_number : undefined;
    const uid = typeof args.uid === 'string' ? args.uid : undefined;
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const show_as_ranges = typeof args.show_as_ranges === 'boolean' ? args.show_as_ranges : false;
    const show_hits = typeof args.show_hits === 'boolean' ? args.show_hits : false;
    const resp = await callManagementApi('POST', 'show-access-rule', {
      layer,
      rule_number,
      uid,
      details_level,
      show_as_ranges,
      show_hits,
    });
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'show_access_layer',
  'Show an access layer object by name or UID.',
  {
    name: z.string().optional().default(''),
    uid: z.string().optional().default(''),
    details_level: z.string().optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const name = typeof args.name === 'string' ? args.name : '';
    const uid = typeof args.uid === 'string' ? args.uid : '';
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const resp = await callManagementApi('POST', 'show-access-layer', { name, uid, details_level });
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'show_access_layers',
  'Show all access layers, with optional filtering and detail level.',
  {
    filter: z.string().optional().default(''),
    limit: z.number().optional(),
    offset: z.number().optional(),
    order: z.array(z.string()).optional(),
    details_level: z.string().optional(),
    domains_to_process: z.array(z.string()).optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const filter = typeof args.filter === 'string' ? args.filter : '';
    const limit = typeof args.limit === 'number' ? args.limit : undefined;
    const offset = typeof args.offset === 'number' ? args.offset : undefined;
    const order = Array.isArray(args.order) ? args.order as string[] : undefined;
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const domains_to_process = Array.isArray(args.domains_to_process) ? args.domains_to_process as string[] : undefined;
    const resp = await callManagementApi('POST', 'show-access-layers', {
      filter,
      limit,
      offset,
      order,
      details_level,
      domains_to_process,
    });
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'show_nat_rulebase',
  'Show the NAT rulebase for a given name or uid. Either name or uid is required, the other can be empty.',
  {
    name: z.string().optional().default(''),
    uid: z.string().optional().default(''),
    package: z.string().optional(),
    filter: z.string().optional().default(''),
    limit: z.number().optional(),
    offset: z.number().optional(),
    order: z.array(z.string()).optional(),
    details_level: z.string().optional(),
    dereference_group_members: z.boolean().optional().default(false),
    show_membership: z.boolean().optional().default(false),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const name = typeof args.name === 'string' ? args.name : '';
    const uid = typeof args.uid === 'string' ? args.uid : '';
    const pkg = typeof args.package === 'string' ? args.package : undefined;
    const filter = typeof args.filter === 'string' ? args.filter : '';
    const limit = typeof args.limit === 'number' ? args.limit : undefined;
    const offset = typeof args.offset === 'number' ? args.offset : undefined;
    const order = Array.isArray(args.order) ? args.order as string[] : undefined;
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const dereference_group_members = typeof args.dereference_group_members === 'boolean' ? args.dereference_group_members : false;
    const show_membership = typeof args.show_membership === 'boolean' ? args.show_membership : false;
    const resp = await callManagementApi('POST', 'show-nat-rulebase', {
      name,
      uid,
      package: pkg,
      filter,
      limit,
      offset,
      order,
      details_level,
      dereference_group_members,
      show_membership,
    });
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'show_access_section',
  'Show an access section by name or UID and layer.',
  {
    name: z.string().optional().default(''),
    uid: z.string().optional().default(''),
    layer: z.string().optional().default(''),
    details_level: z.string().optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const name = typeof args.name === 'string' ? args.name : '';
    const uid = typeof args.uid === 'string' ? args.uid : '';
    const layer = typeof args.layer === 'string' ? args.layer : '';
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const resp = await callManagementApi('POST', 'show-access-section', { name, uid, layer, details_level });
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'show_nat_section',
  'Show a NAT section by name or UID and layer.',
  {
    name: z.string().optional().default(''),
    uid: z.string().optional().default(''),
    layer: z.string().optional().default(''),
    package: z.string().optional(),
    details_level: z.string().optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const name = typeof args.name === 'string' ? args.name : '';
    const uid = typeof args.uid === 'string' ? args.uid : '';
    const layer = typeof args.layer === 'string' ? args.layer : '';
    const pkg = typeof args.package === 'string' ? args.package : undefined;
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const resp = await callManagementApi('POST', 'show-nat-section', { name, uid, layer, package: pkg, details_level });
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);


// --- VPN Community and Gateway/Cluster/LSM Tools ---

server.tool(
  'show_vpn_community_star',
  'Show a VPN Community Star object by name or UID.',
  {
    name: z.string().optional().default(''),
    uid: z.string().optional().default(''),
    details_level: z.string().optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const name = typeof args.name === 'string' ? args.name : '';
    const uid = typeof args.uid === 'string' ? args.uid : '';
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const resp = await callManagementApi('POST', 'show-vpn-community-star', { name, uid, details_level });
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'show_vpn_communities_star',
  'Show all VPN Community Star objects, with optional filtering and detail level.',
  {
    filter: z.string().optional().default(''),
    limit: z.number().optional(),
    offset: z.number().optional(),
    order: z.array(z.string()).optional(),
    details_level: z.string().optional(),
    domains_to_process: z.array(z.string()).optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const filter = typeof args.filter === 'string' ? args.filter : '';
    const limit = typeof args.limit === 'number' ? args.limit : undefined;
    const offset = typeof args.offset === 'number' ? args.offset : undefined;
    const order = Array.isArray(args.order) ? args.order as string[] : undefined;
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const domains_to_process = Array.isArray(args.domains_to_process) ? args.domains_to_process as string[] : undefined;
    const resp = await callManagementApi('POST', 'show-vpn-communities-star', {
      filter,
      limit,
      offset,
      order,
      details_level,
      domains_to_process,
    });
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'show_vpn_community_meshed',
  'Show a VPN Community Meshed object by name or UID.',
  {
    name: z.string().optional().default(''),
    uid: z.string().optional().default(''),
    details_level: z.string().optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const name = typeof args.name === 'string' ? args.name : '';
    const uid = typeof args.uid === 'string' ? args.uid : '';
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const resp = await callManagementApi('POST', 'show-vpn-community-meshed', { name, uid, details_level });
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'show_vpn_communities_meshed',
  'Show all VPN Community Meshed objects, with optional filtering and detail level.',
  {
    filter: z.string().optional().default(''),
    limit: z.number().optional(),
    offset: z.number().optional(),
    order: z.array(z.string()).optional(),
    details_level: z.string().optional(),
    domains_to_process: z.array(z.string()).optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const filter = typeof args.filter === 'string' ? args.filter : '';
    const limit = typeof args.limit === 'number' ? args.limit : undefined;
    const offset = typeof args.offset === 'number' ? args.offset : undefined;
    const order = Array.isArray(args.order) ? args.order as string[] : undefined;
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const domains_to_process = Array.isArray(args.domains_to_process) ? args.domains_to_process as string[] : undefined;
    const resp = await callManagementApi('POST', 'show-vpn-communities-meshed', {
      filter,
      limit,
      offset,
      order,
      details_level,
      domains_to_process,
    });
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'show_vpn_community_remote_access',
  'Show a VPN Community Remote Access object by UID (or default if not specified).',
  {
    uid: z.string().optional().default(''),
    details_level: z.string().optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const uid = typeof args.uid === 'string' ? args.uid : '';
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const resp = await callManagementApi('POST', 'show-vpn-community-remote-access', { uid, details_level });
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'show_vpn_communities_remote_access',
  'Show all VPN Community Remote Access objects, with optional filtering and detail level.',
  {
    filter: z.string().optional().default(''),
    limit: z.number().optional(),
    offset: z.number().optional(),
    order: z.array(z.string()).optional(),
    details_level: z.string().optional(),
    domains_to_process: z.array(z.string()).optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const filter = typeof args.filter === 'string' ? args.filter : '';
    const limit = typeof args.limit === 'number' ? args.limit : undefined;
    const offset = typeof args.offset === 'number' ? args.offset : undefined;
    const order = Array.isArray(args.order) ? args.order as string[] : undefined;
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const domains_to_process = Array.isArray(args.domains_to_process) ? args.domains_to_process as string[] : undefined;
    const resp = await callManagementApi('POST', 'show-vpn-communities-remote-access', {
      filter,
      limit,
      offset,
      order,
      details_level,
      domains_to_process,
    });
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'show_gateways_and_servers',
  'Retrieve multiple gateway and server objects with optional filtering and pagination.',
  {
    filter: z.string().optional().default(''),
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
  'show_simple_gateway',
  'Retrieve a simple gateway object by name or UID.',
  {
    name: z.string().optional().default(''),
    uid: z.string().optional().default(''),
    details_level: z.string().optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const name = typeof args.name === 'string' ? args.name : '';
    const uid = typeof args.uid === 'string' ? args.uid : '';
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const params: Record<string, any> = {};
    if (name) params.name = name;
    if (uid) params.uid = uid;
    if (details_level) params['details-level'] = details_level;
    const resp = await callManagementApi('POST', 'show-simple-gateway', params);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'show_simple_gateways',
  'Retrieve multiple simple gateway objects with optional filtering and pagination.',
  {
    filter: z.string().optional().default(''),
    limit: z.number().optional().default(50),
    offset: z.number().optional().default(0),
    order: z.array(z.any()).optional(),
    show_membership: z.boolean().optional().default(false),
    details_level: z.string().optional(),
    domains_to_process: z.array(z.any()).optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const filter = typeof args.filter === 'string' ? args.filter : '';
    const limit = typeof args.limit === 'number' ? args.limit : 50;
    const offset = typeof args.offset === 'number' ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order as any[] : undefined;
    const show_membership = typeof args.show_membership === 'boolean' ? args.show_membership : false;
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const domains_to_process = Array.isArray(args.domains_to_process) ? args.domains_to_process as any[] : undefined;
    const params: Record<string, any> = { limit, offset, 'show-membership': show_membership };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params['details-level'] = details_level;
    if (domains_to_process) params['domains-to-process'] = domains_to_process;
    const resp = await callManagementApi('POST', 'show-simple-gateways', params);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'show_lsm_clusters',
  'Retrieve multiple LSM cluster objects with optional filtering and pagination.',
  {
    filter: z.string().optional().default(''),
    limit: z.number().optional().default(50),
    offset: z.number().optional().default(0),
    order: z.array(z.any()).optional(),
    details_level: z.string().optional(),
    domains_to_process: z.array(z.any()).optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const filter = typeof args.filter === 'string' ? args.filter : '';
    const limit = typeof args.limit === 'number' ? args.limit : 50;
    const offset = typeof args.offset === 'number' ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order as any[] : undefined;
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const domains_to_process = Array.isArray(args.domains_to_process) ? args.domains_to_process as any[] : undefined;
    const params: Record<string, any> = { limit, offset };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params['details-level'] = details_level;
    if (domains_to_process) params['domains-to-process'] = domains_to_process;
    const resp = await callManagementApi('POST', 'show-lsm-clusters', params);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'show_cluster_member',
  'Retrieve a cluster member object by name or UID.',
  {
    name: z.string().optional().default(''),
    uid: z.string().optional().default(''),
    details_level: z.string().optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const name = typeof args.name === 'string' ? args.name : '';
    const uid = typeof args.uid === 'string' ? args.uid : '';
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const params: Record<string, any> = {};
    if (name) params.name = name;
    if (uid) params.uid = uid;
    if (details_level) params['details-level'] = details_level;
    const resp = await callManagementApi('POST', 'show-cluster-member', params);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'show_cluster_members',
  'Retrieve multiple cluster member objects with optional filtering and pagination.',
  {
    filter: z.string().optional().default(''),
    limit: z.number().optional().default(50),
    offset: z.number().optional().default(0),
    order: z.array(z.any()).optional(),
    details_level: z.string().optional(),
    domains_to_process: z.array(z.any()).optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const filter = typeof args.filter === 'string' ? args.filter : '';
    const limit = typeof args.limit === 'number' ? args.limit : 50;
    const offset = typeof args.offset === 'number' ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order as any[] : undefined;
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const domains_to_process = Array.isArray(args.domains_to_process) ? args.domains_to_process as any[] : undefined;
    const params: Record<string, any> = { limit, offset };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params['details-level'] = details_level;
    if (domains_to_process) params['domains-to-process'] = domains_to_process;
    const resp = await callManagementApi('POST', 'show-cluster-members', params);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'show_lsm_gateway',
  'Retrieve an LSM gateway object by name or UID.',
  {
    name: z.string().optional().default(''),
    uid: z.string().optional().default(''),
    details_level: z.string().optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const name = typeof args.name === 'string' ? args.name : '';
    const uid = typeof args.uid === 'string' ? args.uid : '';
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const params: Record<string, any> = {};
    if (name) params.name = name;
    if (uid) params.uid = uid;
    if (details_level) params['details-level'] = details_level;
    const resp = await callManagementApi('POST', 'show-lsm-gateway', params);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'show_simple_clusters',
  'Retrieve multiple simple cluster objects with optional filtering and pagination.',
  {
    filter: z.string().optional().default(''),
    limit: z.number().optional().default(50),
    offset: z.number().optional().default(0),
    order: z.array(z.any()).optional(),
    details_level: z.string().optional(),
    domains_to_process: z.array(z.any()).optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const filter = typeof args.filter === 'string' ? args.filter : '';
    const limit = typeof args.limit === 'number' ? args.limit : 50;
    const offset = typeof args.offset === 'number' ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order as any[] : undefined;
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const domains_to_process = Array.isArray(args.domains_to_process) ? args.domains_to_process as any[] : undefined;
    const params: Record<string, any> = { limit, offset };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params['details-level'] = details_level;
    if (domains_to_process) params['domains-to-process'] = domains_to_process;
    const resp = await callManagementApi('POST', 'show-simple-clusters', params);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'show_simple_cluster',
  'Retrieve a simple cluster object by name or UID.',
  {
    name: z.string().optional().default(''),
    uid: z.string().optional().default(''),
    details_level: z.string().optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const name = typeof args.name === 'string' ? args.name : '';
    const uid = typeof args.uid === 'string' ? args.uid : '';
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const params: Record<string, any> = {};
    if (name) params.name = name;
    if (uid) params.uid = uid;
    if (details_level) params['details-level'] = details_level;
    const resp = await callManagementApi('POST', 'show-simple-cluster', params);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'show_lsm_gateways',
  'Retrieve multiple LSM gateway objects with optional filtering and pagination.',
  {
    filter: z.string().optional().default(''),
    limit: z.number().optional().default(50),
    offset: z.number().optional().default(0),
    order: z.array(z.any()).optional(),
    details_level: z.string().optional(),
    domains_to_process: z.array(z.any()).optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const filter = typeof args.filter === 'string' ? args.filter : '';
    const limit = typeof args.limit === 'number' ? args.limit : 50;
    const offset = typeof args.offset === 'number' ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order as any[] : undefined;
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const domains_to_process = Array.isArray(args.domains_to_process) ? args.domains_to_process as any[] : undefined;
    const params: Record<string, any> = { limit, offset };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params['details-level'] = details_level;
    if (domains_to_process) params['domains-to-process'] = domains_to_process;
    const resp = await callManagementApi('POST', 'show-lsm-gateways', params);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'show_lsm_cluster',
  'Retrieve an LSM cluster object by name or UID.',
  {
    name: z.string().optional().default(''),
    uid: z.string().optional().default(''),
    details_level: z.string().optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const name = typeof args.name === 'string' ? args.name : '';
    const uid = typeof args.uid === 'string' ? args.uid : '';
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const params: Record<string, any> = {};
    if (name) params.name = name;
    if (uid) params.uid = uid;
    if (details_level) params['details-level'] = details_level;
    const resp = await callManagementApi('POST', 'show-lsm-cluster', params);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'show_groups',
  'Retrieve multiple group objects with optional filtering and pagination.',
  {
    filter: z.string().optional(),
    limit: z.number().optional().default(50),
    offset: z.number().optional().default(0),
    order: z.array(z.any()).optional(),
    show_as_ranges: z.boolean().optional().default(false),
    dereference_group_members: z.boolean().optional().default(false),
    show_membership: z.boolean().optional().default(false),
    details_level: z.string().optional(),
    domains_to_process: z.array(z.any()).optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const filter = typeof args.filter === 'string' ? args.filter : '';
    const limit = typeof args.limit === 'number' ? args.limit : 50;
    const offset = typeof args.offset === 'number' ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order as any[] : undefined;
    const show_as_ranges = typeof args.show_as_ranges === 'boolean' ? args.show_as_ranges : false;
    const dereference_group_members = typeof args.dereference_group_members === 'boolean' ? args.dereference_group_members : false;
    const show_membership = typeof args.show_membership === 'boolean' ? args.show_membership : false;
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const domains_to_process = Array.isArray(args.domains_to_process) ? args.domains_to_process as any[] : undefined;
    const params: Record<string, any> = {
      limit, offset, 'show-as-ranges': show_as_ranges, 'dereference-group-members': dereference_group_members, 'show-membership': show_membership
    };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params['details-level'] = details_level;
    if (domains_to_process) params['domains-to-process'] = domains_to_process;
    const resp = await callManagementApi('POST', 'show-groups', params);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'show_services_tcp',
  'Retrieve multiple TCP service objects with optional filtering and pagination.',
  {
    filter: z.string().optional(),
    limit: z.number().optional().default(50),
    offset: z.number().optional().default(0),
    order: z.array(z.any()).optional(),
    show_membership: z.boolean().optional().default(false),
    details_level: z.string().optional(),
    domains_to_process: z.array(z.any()).optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const filter = typeof args.filter === 'string' ? args.filter : '';
    const limit = typeof args.limit === 'number' ? args.limit : 50;
    const offset = typeof args.offset === 'number' ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order as any[] : undefined;
    const show_membership = typeof args.show_membership === 'boolean' ? args.show_membership : false;
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const domains_to_process = Array.isArray(args.domains_to_process) ? args.domains_to_process as any[] : undefined;
    const params: Record<string, any> = { limit, offset, 'show-membership': show_membership };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params['details-level'] = details_level;
    if (domains_to_process) params['domains-to-process'] = domains_to_process;
    const resp = await callManagementApi('POST', 'show-services-tcp', params);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'show_application_sites',
  'Retrieve multiple application site objects with optional filtering and pagination.',
  {
    filter: z.string().optional(),
    limit: z.number().optional().default(50),
    offset: z.number().optional().default(0),
    order: z.array(z.any()).optional(),
    show_membership: z.boolean().optional().default(false),
    details_level: z.string().optional(),
    domains_to_process: z.array(z.any()).optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const filter = typeof args.filter === 'string' ? args.filter : '';
    const limit = typeof args.limit === 'number' ? args.limit : 50;
    const offset = typeof args.offset === 'number' ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order as any[] : undefined;
    const show_membership = typeof args.show_membership === 'boolean' ? args.show_membership : false;
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const domains_to_process = Array.isArray(args.domains_to_process) ? args.domains_to_process as any[] : undefined;
    const params: Record<string, any> = { limit, offset, 'show-membership': show_membership };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params['details-level'] = details_level;
    if (domains_to_process) params['domains-to-process'] = domains_to_process;
    const resp = await callManagementApi('POST', 'show-application-sites', params);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'show_application_site_groups',
  'Retrieve multiple application site group objects with optional filtering and pagination.',
  {
    filter: z.string().optional(),
    limit: z.number().optional().default(50),
    offset: z.number().optional().default(0),
    order: z.array(z.any()).optional(),
    dereference_members: z.boolean().optional().default(false),
    show_membership: z.boolean().optional().default(false),
    details_level: z.string().optional(),
    domains_to_process: z.array(z.any()).optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const filter = typeof args.filter === 'string' ? args.filter : '';
    const limit = typeof args.limit === 'number' ? args.limit : 50;
    const offset = typeof args.offset === 'number' ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order as any[] : undefined;
    const dereference_members = typeof args.dereference_members === 'boolean' ? args.dereference_members : false;
    const show_membership = typeof args.show_membership === 'boolean' ? args.show_membership : false;
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const domains_to_process = Array.isArray(args.domains_to_process) ? args.domains_to_process as any[] : undefined;
    const params: Record<string, any> = { limit, offset, 'dereference-members': dereference_members, 'show-membership': show_membership };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params['details-level'] = details_level;
    if (domains_to_process) params['domains-to-process'] = domains_to_process;
    const resp = await callManagementApi('POST', 'show-application-site-groups', params);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'show_services_udp',
  'Retrieve multiple UDP service objects with optional filtering and pagination.',
  {
    filter: z.string().optional(),
    limit: z.number().optional().default(50),
    offset: z.number().optional().default(0),
    order: z.array(z.any()).optional(),
    show_membership: z.boolean().optional().default(false),
    details_level: z.string().optional(),
    domains_to_process: z.array(z.any()).optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const filter = typeof args.filter === 'string' ? args.filter : '';
    const limit = typeof args.limit === 'number' ? args.limit : 50;
    const offset = typeof args.offset === 'number' ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order as any[] : undefined;
    const show_membership = typeof args.show_membership === 'boolean' ? args.show_membership : false;
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const domains_to_process = Array.isArray(args.domains_to_process) ? args.domains_to_process as any[] : undefined;
    const params: Record<string, any> = { limit, offset, 'show-membership': show_membership };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params['details-level'] = details_level;
    if (domains_to_process) params['domains-to-process'] = domains_to_process;
    const resp = await callManagementApi('POST', 'show-services-udp', params);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'show_wildcards',
  'Retrieve multiple wildcard objects with optional filtering and pagination.',
  {
    filter: z.string().optional(),
    limit: z.number().optional().default(50),
    offset: z.number().optional().default(0),
    order: z.array(z.any()).optional(),
    details_level: z.string().optional(),
    domains_to_process: z.array(z.any()).optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const filter = typeof args.filter === 'string' ? args.filter : '';
    const limit = typeof args.limit === 'number' ? args.limit : 50;
    const offset = typeof args.offset === 'number' ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order as any[] : undefined;
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const domains_to_process = Array.isArray(args.domains_to_process) ? args.domains_to_process as any[] : undefined;
    const params: Record<string, any> = { limit, offset };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params['details-level'] = details_level;
    if (domains_to_process) params['domains-to-process'] = domains_to_process;
    const resp = await callManagementApi('POST', 'show-wildcards', params);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

// Tool: show_security_zones
server.tool(
  'show_security_zones',
  'Retrieve multiple security zone objects with optional filtering and pagination.',
  {
    filter: z.string().optional(),
    limit: z.number().optional().default(50),
    offset: z.number().optional().default(0),
    order: z.array(z.any()).optional(),
    details_level: z.string().optional(),
    domains_to_process: z.array(z.any()).optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const filter = typeof args.filter === 'string' ? args.filter : '';
    const limit = typeof args.limit === 'number' ? args.limit : 50;
    const offset = typeof args.offset === 'number' ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order as any[] : undefined;
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const domains_to_process = Array.isArray(args.domains_to_process) ? args.domains_to_process as any[] : undefined;
    const params: Record<string, any> = { limit, offset };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params['details-level'] = details_level;
    if (domains_to_process) params['domains-to-process'] = domains_to_process;
    const resp = await callManagementApi('POST', 'show-security-zones', params);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

// Tool: show_tags
server.tool(
  'show_tags',
  'Retrieve multiple tag objects with optional filtering and pagination.',
  {
    filter: z.string().optional(),
    limit: z.number().optional().default(50),
    offset: z.number().optional().default(0),
    order: z.array(z.any()).optional(),
    details_level: z.string().optional(),
    domains_to_process: z.array(z.any()).optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const filter = typeof args.filter === 'string' ? args.filter : '';
    const limit = typeof args.limit === 'number' ? args.limit : 50;
    const offset = typeof args.offset === 'number' ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order as any[] : undefined;
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const domains_to_process = Array.isArray(args.domains_to_process) ? args.domains_to_process as any[] : undefined;
    const params: Record<string, any> = { limit, offset };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params['details-level'] = details_level;
    if (domains_to_process) params['domains-to-process'] = domains_to_process;
    const resp = await callManagementApi('POST', 'show-tags', params);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

// Tool: show_address_ranges
server.tool(
  'show_address_ranges',
  'Retrieve multiple address range objects with optional filtering and pagination.',
  {
    filter: z.string().optional(),
    limit: z.number().optional().default(50),
    offset: z.number().optional().default(0),
    order: z.array(z.any()).optional(),
    details_level: z.string().optional(),
    domains_to_process: z.array(z.any()).optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const filter = typeof args.filter === 'string' ? args.filter : '';
    const limit = typeof args.limit === 'number' ? args.limit : 50;
    const offset = typeof args.offset === 'number' ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order as any[] : undefined;
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const domains_to_process = Array.isArray(args.domains_to_process) ? args.domains_to_process as any[] : undefined;
    const params: Record<string, any> = { limit, offset };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params['details-level'] = details_level;
    if (domains_to_process) params['domains-to-process'] = domains_to_process;
    const resp = await callManagementApi('POST', 'show-address-ranges', params);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

// Tool: show_application_site_categories
server.tool(
  'show_application_site_categories',
  'Retrieve multiple application site category objects with optional filtering and pagination.',
  {
    filter: z.string().optional(),
    limit: z.number().optional().default(50),
    offset: z.number().optional().default(0),
    order: z.array(z.any()).optional(),
    details_level: z.string().optional(),
    domains_to_process: z.array(z.any()).optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const filter = typeof args.filter === 'string' ? args.filter : '';
    const limit = typeof args.limit === 'number' ? args.limit : 50;
    const offset = typeof args.offset === 'number' ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order as any[] : undefined;
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const domains_to_process = Array.isArray(args.domains_to_process) ? args.domains_to_process as any[] : undefined;
    const params: Record<string, any> = { limit, offset };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params['details-level'] = details_level;
    if (domains_to_process) params['domains-to-process'] = domains_to_process;
    const resp = await callManagementApi('POST', 'show-application-site-categories', params);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'show_dynamic_objects',
  'Retrieve multiple dynamic objects with optional filtering and pagination.',
  {
    filter: z.string().optional(),
    limit: z.number().optional().default(50),
    offset: z.number().optional().default(0),
    order: z.array(z.any()).optional(),
    details_level: z.string().optional(),
    domains_to_process: z.array(z.any()).optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const filter = typeof args.filter === 'string' ? args.filter : '';
    const limit = typeof args.limit === 'number' ? args.limit : 50;
    const offset = typeof args.offset === 'number' ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order as any[] : undefined;
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const domains_to_process = Array.isArray(args.domains_to_process) ? args.domains_to_process as any[] : undefined;
    const params: Record<string, any> = { limit, offset };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params['details-level'] = details_level;
    if (domains_to_process) params['domains-to-process'] = domains_to_process;
    const resp = await callManagementApi('POST', 'show-dynamic-objects', params);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

// Tool: show_services_icmp6
server.tool(
  'show_services_icmp6',
  'Retrieve multiple ICMPv6 service objects with optional filtering and pagination.',
  {
    filter: z.string().optional(),
    limit: z.number().optional().default(50),
    offset: z.number().optional().default(0),
    order: z.array(z.any()).optional(),
    show_membership: z.boolean().optional().default(false),
    details_level: z.string().optional(),
    domains_to_process: z.array(z.any()).optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const filter = typeof args.filter === 'string' ? args.filter : '';
    const limit = typeof args.limit === 'number' ? args.limit : 50;
    const offset = typeof args.offset === 'number' ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order as any[] : undefined;
    const show_membership = typeof args.show_membership === 'boolean' ? args.show_membership : false;
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const domains_to_process = Array.isArray(args.domains_to_process) ? args.domains_to_process as any[] : undefined;
    const params: Record<string, any> = { limit, offset, 'show-membership': show_membership };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params['details-level'] = details_level;
    if (domains_to_process) params['domains-to-process'] = domains_to_process;
    const resp = await callManagementApi('POST', 'show-services-icmp6', params);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'show_services_icmp',
  'Retrieve multiple ICMP service objects with optional filtering and pagination.',
  {
    filter: z.string().optional(),
    limit: z.number().optional().default(50),
    offset: z.number().optional().default(0),
    order: z.array(z.any()).optional(),
    show_membership: z.boolean().optional().default(false),
    details_level: z.string().optional(),
    domains_to_process: z.array(z.any()).optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const filter = typeof args.filter === 'string' ? args.filter : '';
    const limit = typeof args.limit === 'number' ? args.limit : 50;
    const offset = typeof args.offset === 'number' ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order as any[] : undefined;
    const show_membership = typeof args.show_membership === 'boolean' ? args.show_membership : false;
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const domains_to_process = Array.isArray(args.domains_to_process) ? args.domains_to_process as any[] : undefined;
    const params: Record<string, any> = { limit, offset, 'show-membership': show_membership };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params['details-level'] = details_level;
    if (domains_to_process) params['domains-to-process'] = domains_to_process;
    const resp = await callManagementApi('POST', 'show-services-icmp', params);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

// Tool: show_service_groups
server.tool(
  'show_service_groups',
  'Retrieve multiple service group objects with optional filtering and pagination.',
  {
    filter: z.string().optional(),
    limit: z.number().optional().default(50),
    offset: z.number().optional().default(0),
    order: z.array(z.any()).optional(),
    show_as_ranges: z.boolean().optional().default(false),
    dereference_members: z.boolean().optional().default(false),
    show_membership: z.boolean().optional().default(false),
    details_level: z.string().optional(),
    domains_to_process: z.array(z.any()).optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const filter = typeof args.filter === 'string' ? args.filter : '';
    const limit = typeof args.limit === 'number' ? args.limit : 50;
    const offset = typeof args.offset === 'number' ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order as any[] : undefined;
    const show_as_ranges = typeof args.show_as_ranges === 'boolean' ? args.show_as_ranges : false;
    const dereference_members = typeof args.dereference_members === 'boolean' ? args.dereference_members : false;
    const show_membership = typeof args.show_membership === 'boolean' ? args.show_membership : false;
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const domains_to_process = Array.isArray(args.domains_to_process) ? args.domains_to_process as any[] : undefined;
    const params: Record<string, any> = {
      limit, offset, 'show-as-ranges': show_as_ranges, 'dereference-members': dereference_members, 'show-membership': show_membership
    };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params['details-level'] = details_level;
    if (domains_to_process) params['domains-to-process'] = domains_to_process;
    const resp = await callManagementApi('POST', 'show-service-groups', params);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'show_multicast_address_ranges',
  'Retrieve multiple multicast address range objects with optional filtering and pagination.',
  {
    filter: z.string().optional(),
    limit: z.number().optional().default(50),
    offset: z.number().optional().default(0),
    order: z.array(z.any()).optional(),
    details_level: z.string().optional(),
    domains_to_process: z.array(z.any()).optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const filter = typeof args.filter === 'string' ? args.filter : '';
    const limit = typeof args.limit === 'number' ? args.limit : 50;
    const offset = typeof args.offset === 'number' ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order as any[] : undefined;
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const domains_to_process = Array.isArray(args.domains_to_process) ? args.domains_to_process as any[] : undefined;
    const params: Record<string, any> = { limit, offset };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params['details-level'] = details_level;
    if (domains_to_process) params['domains-to-process'] = domains_to_process;
    const resp = await callManagementApi('POST', 'show-multicast-address-ranges', params);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

// Tool: show_dns_domains
server.tool(
  'show_dns_domains',
  'Retrieve multiple DNS domain objects with optional filtering and pagination.',
  {
    filter: z.string().optional(),
    limit: z.number().optional().default(50),
    offset: z.number().optional().default(0),
    order: z.array(z.any()).optional(),
    details_level: z.string().optional(),
    domains_to_process: z.array(z.any()).optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const filter = typeof args.filter === 'string' ? args.filter : '';
    const limit = typeof args.limit === 'number' ? args.limit : 50;
    const offset = typeof args.offset === 'number' ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order as any[] : undefined;
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const domains_to_process = Array.isArray(args.domains_to_process) ? args.domains_to_process as any[] : undefined;
    const params: Record<string, any> = { limit, offset };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params['details-level'] = details_level;
    if (domains_to_process) params['domains-to-process'] = domains_to_process;
    const resp = await callManagementApi('POST', 'show-dns-domains', params);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

// Tool: show_time_groups
server.tool(
  'show_time_groups',
  'Retrieve multiple time group objects with optional filtering and pagination.',
  {
    filter: z.string().optional(),
    limit: z.number().optional().default(50),
    offset: z.number().optional().default(0),
    order: z.array(z.any()).optional(),
    details_level: z.string().optional(),
    domains_to_process: z.array(z.any()).optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const filter = typeof args.filter === 'string' ? args.filter : '';
    const limit = typeof args.limit === 'number' ? args.limit : 50;
    const offset = typeof args.offset === 'number' ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order as any[] : undefined;
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const domains_to_process = Array.isArray(args.domains_to_process) ? args.domains_to_process as any[] : undefined;
    const params: Record<string, any> = { limit, offset };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params['details-level'] = details_level;
    if (domains_to_process) params['domains-to-process'] = domains_to_process;
    const resp = await callManagementApi('POST', 'show-time-groups', params);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

// Tool: show_access_point_names
server.tool(
  'show_access_point_names',
  'Retrieve multiple access point name objects with optional filtering and pagination.',
  {
    filter: z.string().optional(),
    limit: z.number().optional().default(50),
    offset: z.number().optional().default(0),
    order: z.array(z.any()).optional(),
    details_level: z.string().optional(),
    domains_to_process: z.array(z.any()).optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const filter = typeof args.filter === 'string' ? args.filter : '';
    const limit = typeof args.limit === 'number' ? args.limit : 50;
    const offset = typeof args.offset === 'number' ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order as any[] : undefined;
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const domains_to_process = Array.isArray(args.domains_to_process) ? args.domains_to_process as any[] : undefined;
    const params: Record<string, any> = { limit, offset };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params['details-level'] = details_level;
    if (domains_to_process) params['domains-to-process'] = domains_to_process;
    const resp = await callManagementApi('POST', 'show-access-point-names', params);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  'show_objects',
  'Retrieve multiple generic objects with optional filtering and pagination.',
  {
    filter: z.string().optional(),
    limit: z.number().optional().default(50),
    offset: z.number().optional().default(0),
    order: z.array(z.any()).optional(),
    details_level: z.string().optional(),
    domains_to_process: z.array(z.any()).optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const filter = typeof args.filter === 'string' ? args.filter : '';
    const limit = typeof args.limit === 'number' ? args.limit : 50;
    const offset = typeof args.offset === 'number' ? args.offset : 0;
    const order = Array.isArray(args.order) ? args.order as any[] : undefined;
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const domains_to_process = Array.isArray(args.domains_to_process) ? args.domains_to_process as any[] : undefined;
    const params: Record<string, any> = { limit, offset };
    if (filter) params.filter = filter;
    if (order) params.order = order;
    if (details_level) params['details-level'] = details_level;
    if (domains_to_process) params['domains-to-process'] = domains_to_process;
    const resp = await callManagementApi('POST', 'show-objects', params);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

// Tool: show_object
server.tool(
  'show_object',
  'Retrieve a generic object by name or UID.',
  {
    name: z.string().optional(),
    uid: z.string().optional(),
    details_level: z.string().optional(),
  },
  async (args: Record<string, unknown>, extra: any) => {
    const name = typeof args.name === 'string' ? args.name : undefined;
    const uid = typeof args.uid === 'string' ? args.uid : undefined;
    const details_level = typeof args.details_level === 'string' ? args.details_level : undefined;
    const params: Record<string, any> = {};
    if (name) params.name = name;
    if (uid) params.uid = uid;
    if (details_level) params['details-level'] = details_level;
    const resp = await callManagementApi('POST', 'show-object', params);
    return { content: [{ type: 'text', text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  "show_time_objects",
  "Show all time objects",
  {},
  async () => {
    const result = await callManagementApi("GET", "/web_api/show-times", {});
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

export { server };

// Access entrypoint
// import path from 'path';
// import { fileURLToPath } from 'url';
//
// const isMain = fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
// if (isMain) {
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
console.error('Access MCP server running on stdio');
};
main().catch((error) => {
console.error('Fatal error in main():', error);
process.exit(1);
});
// }
// else {
//   console.error('This module is not intended to be run directly. Please use the provided entrypoint.');
// }
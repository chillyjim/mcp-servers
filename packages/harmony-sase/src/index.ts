#!/usr/bin/env node
// Harmony SASE MCP server implementation
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod";
import {
  Settings,
  getApiManager,
} from "@chkp/harmony-infra";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { launchMCPServer } from "@chkp/mcp-utils";

const API_V2_1 = "2.1";
const API_V2_1_NETWORKS = `/rest/v${API_V2_1}/networks`;
const API_V2_1_APPLICATIONS = `/rest/v${API_V2_1}/applications`;

// Create a new MCP server instance
const server = new McpServer({
  name: "harmony_sase",
  version: "1.0.0", // Added missing version parameter
  description:
    "MCP server to run commands on a Check Point Harmony SASE. " +
    "Use this to list networks topology, network regions, network gateways, " +
    "network applications, and deep dive to any of those entities using its ID.",
});

/**
 * Helper function to run API calls
 */
async function runApi(
  method: string,
  uri: string,
  data: Record<string, any>
): Promise<Record<string, any>> {
  const apiManager = await getApiManager();
  return await apiManager.callApi(method, uri, data);
}

// --- Harmony SASE API Tools ---

// Networks
server.tool("list_networks", "List all Harmony SASE networks", {}, async () => {
  console.error("Running list_networks");
  const result = await runApi("GET", API_V2_1_NETWORKS, {});
  console.error("result", result);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
});

server.tool(
  "get_network",
  "Get a Harmony SASE network by ID",
  {
    network_id: z.string().describe("Network ID (required)"),
  },
  async ({ network_id }) => {
    console.error("Running get_network");
    const result = await runApi("GET", `${API_V2_1_NETWORKS}/${network_id}`, {});

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }
);

server.tool(
  "get_gateway",
  "Get a gateway by ID from a Harmony SASE network",
  {
    network_id: z.string().describe("Network ID (required)"),
    gateway_id: z.string().describe("Gateway ID (required)"),
  },
  async ({ network_id, gateway_id }) => {
    console.error("Running get_gateway");
    const result = await runApi(
      "GET",
      `${API_V2_1_NETWORKS}/${network_id}/instances/${gateway_id}`,
      {}
    );

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }
);

// Regions
server.tool(
  "list_network_regions",
  "List all available Harmony SASE network regions",
  {},
  async () => {
    console.error("Running list_network_regions");
    const result = await runApi("GET", `${API_V2_1_NETWORKS}/regions`, {});

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }
);

server.tool(
  "get_region",
  "Get a region by ID from a Harmony SASE network",
  {
    network_id: z.string().describe("Network ID (required)"),
    region_id: z.string().describe("Region ID (required)"),
  },
  async ({ network_id, region_id }) => {
    console.error("Running get_region");
    const result = await runApi(
      "GET",
      `${API_V2_1_NETWORKS}/${network_id}/regions/${region_id}`,
      {}
    );

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }
);

// Applications
server.tool("list_applications", "List all applications", {}, async () => {
  console.error("Running list_applications");
  const result = await runApi("GET", API_V2_1_APPLICATIONS, {});

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
});

server.tool(
  "get_application",
  "Get an application by ID",
  {
    application_id: z.string().describe("Application ID (required)"),
  },
  async ({ application_id }) => {
    console.error("Running get_application");
    const result = await runApi(
      "GET",
      `${API_V2_1_APPLICATIONS}/${application_id}`,
      {}
    );

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }
);

// Aliases for other tools
server.tool(
  "find_network",
  "Find a Harmony SASE network by ID (alias for get_network)",
  {
    network_id: z.string().describe("Network ID (required)"),
  },
  async ({ network_id }) => {
    console.error("Running find_network");
    const result = await runApi("GET", `${API_V2_1_NETWORKS}/${network_id}`, {});

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }
);

// Start the server if this file is run directly
// In ES modules, import.meta.url will be defined when the file is loaded directly
// rather than imported as a module
// Get package information for version display
const pkg = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../package.json'), 'utf-8')
);

process.env.CP_MCP_MAIN_PKG = `${pkg.name} v${pkg.version}`;

export { server };

const main = async () => {
  await launchMCPServer(
    join(dirname(fileURLToPath(import.meta.url)), 'server-config.json'),
    { server, Settings, pkg }
  );
};

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});

# MCP Server Infrastructure

Shared infrastructure code for Check Point MCP servers. This package provides common utilities, API clients, and server helpers used across all MCP server implementations.

## Installation

```bash
npm install @cp-mcp/infra
```

## Features

- API client for Check Point products
  - Smart One Cloud
  - On-premise Management Server
  - Harmony SASE
- Async logging with MCP context
- Settings management
- Server utility functions
- Server runner CLI

## Usage

### Creating a new MCP server

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import { startServer } from '@cp-mcp/infra';

// Create a new MCP server instance
const server = new McpServer({
  name: "my-server",
  description: "My MCP server",
  version: "1.0.0"
});

// Add tools
server.tool(
  "my-tool",
  "Description of my tool",
  {
    param1: z.string().describe("Parameter description"),
  },
  async ({ param1 }) => {
    // Tool implementation
    return {
      content: [
        {
          type: "text",
          text: "Response text"
        },
      ],
    };
  }
);

// Start the server
async function main() {
  await startServer(server);
}

main().catch(error => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
```

### Using the API client

```typescript
import { getApiManager, ServerType, callManagementApi } from '@cp-mcp/infra';

// Get an API manager
const apiManager = await getApiManager(ServerType.MANAGEMENT);

// Call the API
const response = await apiManager.callApi('post', 'show-hosts', { 
  limit: 10,
  offset: 0
});

// Or use the convenience function
const hosts = await callManagementApi('POST', 'show-hosts', {
  limit: 10,
  offset: 0
});
```

## CLI Usage

The package includes a CLI for running MCP servers:

```bash
npx cp-mcp-run <server-name>
```

Where `<server-name>` is one of the registered servers in the monorepo.

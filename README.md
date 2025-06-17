# MCP Servers Monorepo

This repository contains a collection of Model Context Protocol (MCP) servers implemented in TypeScript. Each server is organized as a separate package within the monorepo structure.

## Getting Started

To work with this repository:

```bash
# Clone the repository
git clone [repository-url]

# Install dependencies
npm install

# Build all packages
npm run build
```

## Running MCP Servers

To run any of the MCP servers in this repository:

1. Navigate to the specific server package directory
2. Follow the instructions in that package's README.md
3. When installing dependencies or running npm/npx commands, make sure to include the registry argument:

```bash
--registry https://artifactory-product.checkpoint.com/artifactory/api/npm/npm/
```

### For example, to run the Management MCP server:
``` json
"quantum-management":
    {
        "command": "npx",
        "args":
        [
            "--registry",
            "https://artifactory-product.checkpoint.com/artifactory/api/npm/npm/",
            "-y",
            "@chkp/genai-mcp-server-management@latest"
        ],
        "env":
        {
            "S1C_URL": YOUR_S1C_URL, // (for smart1-cloud)
            "MANAGEMENT_HOST": YOUR_MANAGEMENT_HOST, // (for on-prem)
            "API_KEY": YOUR_API_KEY,            
            "USERNAME": YOUR_USERNAME,
            "PASSWORD": YOUR_PASSWORD,            
        }
    }
```
## Available MCP Servers

The following table lists all available MCP servers in this repository:

| Server | Internal Package | External Package |
|--------|-----------------|-----------------|
| Management | @chkp/genai-mcp-server-management@latest | @chkp/quantum_management_mcp |

## Repository Structure

This monorepo is organized as follows:

- `/packages` - Contains all MCP server implementations and shared libraries
  - `/infra` - Shared infrastructure components
  - `/management` - Management MCP server

## Development

For development instructions, please refer to the README within each package directory.


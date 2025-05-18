# Check Point Quantum Management MCP Server

## What is MCP?

The Model Context Protocol (MCP) is a standardized interface that allows AI agents and automation tools to interact programmatically with Check Point Quantum Management servers. Using MCP, you can:

- Query and visualize installed policies, rulebases, and network topology
- Retrieve and analyze access, NAT, and threat prevention rules
- List and inspect objects such as hosts, networks, services, VPN communities, and more

## Demo

<!-- Place a link or embed for a demo video here -->

## Use Cases

### Ensure regulatory compliance with industry standards  
Prompt: Check if my gateway configuration meets PCI-DSS/HIPAA/GDPR requirements.

### Find broad-definition rules  
Prompt: List all firewall rules that allow traffic from any source to any destination on any port. Highlight rules that are disabled or unused.

### Source → Destination Path Analysis  
Prompt: Can you check in my policy if a HOST or Network can access the internet?

### Recommendation for rulebase optimization  
Prompt: Take a look at the internet-facing rules in my policy and suggest improvements. Identify if there are any rules that should be strengthened or loosened. Consider both security risks and administrative overhead. In your recommendations, refer only to specific rules that can be changed or suggest adding new ones.

### Custom policy visualizations  
Prompt: Please create a visual report that shows which services are allowed in my network, under which conditions, and which services are strictly blocked.

---

## Configuration Options

This server supports two main modes of authentication:

### 1. Smart-1 Cloud (API Key)

Authenticate to Check Point Smart-1 Cloud using an API key.

- **How to generate an API key:**  
  In your Smart-1 Cloud dashboard, go to **Settings → API & SmartConsole** and generate an API key.  
  Copy the key and the server login URL (excluding the `/login` suffix) to your client settings.  
  ![alt text](s1c_api_key.png)

Set the following environment variables:

- `API_KEY`: Your Smart-1 Cloud API key  
- `S1C_URL`: Your Smart-1 Cloud tenant "Web-API" URL  

---

### 2. On-Prem Management (API Key or Username/Password)

- **Configure your management server to allow API access:**  
  To use this server with an on-premises Check Point management server, you must first enable API access.  
  Follow the official instructions for [Managing Security through API](https://sc1.checkpoint.com/documents/R82/WebAdminGuides/EN/CP_R82_SmartProvisioning_AdminGuide/Content/Topics-SPROVG/Managing-Security-through-API.htm).

- **Authenticate to the Security Management Server** using either an API key or username/password:  
  - Follow the official instructions: [Managing Administrator Accounts (Check Point R81+)](https://sc1.checkpoint.com/documents/R81/WebAdminGuides/EN/CP_R81_SecurityManagement_AdminGuide/Topics-SECMG/Managing_Administrator_Accounts.htm)  
  - When creating the administrator, assign appropriate permissions for API access and management operations.  
  - You can authenticate using an API key (recommended for automation) or username/password credentials.

Set the following environment variables:

- `MANAGEMENT_HOST`: IP address or hostname of your management server  
- `PORT`: (Optional) Management server port (default: 443)  
- `API_KEY`: Your management API key (if using API key authentication)  
- `USERNAME`: Username for authentication (if using username/password authentication)  
- `PASSWORD`: Password for authentication (if using username/password authentication)  

---

## Client Configuration

This server can be used with Claude Desktop, Cursor, GitHub Copilot MCP integrations, or any other MCP client.  
> Note: Due to the nature of management API calls, using this server may require a paid subscription to the model provider to handle token limits and context windows.

### Smart-1 Cloud Example

```json
{
  "mcpServers": {
    "quantum-management": {
      "command": "npx",
      "args": ["@chkp/quantum_management_mcp"],
      "env": {
        "API_KEY": "YOUR_API_KEY",
        "S1C_URL": "YOUR_S1C_URL" // e.g., https://xxxxxxxx.maas.checkpoint.com/yyyyyyy/web_api
      }
    }
  }
}
```

### On-Prem Management Example

```json
{
  "mcpServers": {
    "quantum-management": {
      "command": "npx",
      "args": ["@chkp/quantum_management_mcp"],
      "env": {
        "MANAGEMENT_HOST": "YOUR_MANAGEMENT_IP_OR_HOST_NAME",
        "MANAGEMENT_PORT": "443", // optional, default is 443
        "API_KEY": "YOUR_API_KEY", // or use USERNAME and PASSWORD
        "USERNAME": "YOUR_USERNAME", // optional
        "PASSWORD": "YOUR_PASSWORD"  // optional
      }
    }
  }
}
```

> Set only the environment variables required for your authentication method (see above).

### Configuring the Claude Desktop App

#### For macOS:

```bash
# Create the config file if it doesn't exist
touch "$HOME/Library/Application Support/Claude/claude_desktop_config.json"

# Open the config file in TextEdit
open -e "$HOME/Library/Application Support/Claude/claude_desktop_config.json"
```

#### For Windows:

```cmd
code %APPDATA%\Claude\claude_desktop_config.json
```

Add the server configuration:

```json
{
  "mcpServers": {
    "quantum-management": {
      "command": "npx",
      "args": ["@chkp/quantum_management_mcp"],
      "env": {
        // Add the configuration from the above instructions
      }
    }
  }
}
```

---

## Development

### Prerequisites

- Node.js 22+  
- npm 8+  

### Setup

```bash
# Install all dependencies
npm install
```

### Build

```bash
# Build all packages
npm run build
```

### Running Locally

Run the server locally for development using [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector) or any MCP client.

```bash
node FULL_PATH_TO_SERVER/packages/management/dist/index.js --s1c-url|--management-host --api-key|--username|--password
```

---

## ⚠️ Security Notice

1. **Authentication keys and credentials are never shared with the model.** They are used only by the MCP server to authenticate with your Check Point management system.  
2. **Only use client implementations you trust.** Malicious or untrusted clients could misuse your credentials or access data improperly.  
3. **Management data is exposed to the model.** Use models and providers that comply with your organization’s policies on sensitive data and PII handling.
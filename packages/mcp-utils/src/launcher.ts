#!/usr/bin/env node
import { Command } from 'commander';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { randomUUID } from 'crypto';

export interface CliOption {
  flag: string;
  description: string;
  env?: string;
  default?: string;
  type?: 'string' | 'boolean';
}

export interface ServerConfig {
  name: string;
  description?: string;
  options: CliOption[];
}

export interface ServerModule {
  server: any; // The MCP server instance
  Settings: {
    fromArgs(options: any): any;
    setSettings(settings: any): void;
    fromHeaders?(headers: Record<string, string | string[]>): any;
  };
  pkg: { version: string };
}

export type TransportType = 'stdio' | 'sse';

/**
 * Launch an MCP server with configuration-driven CLI options
 * @param configPath Path to the server configuration JSON file
 * @param serverModule The server module containing server, Settings, and pkg
 */
export async function launchMCPServer(
  configPath: string,
  serverModule: ServerModule
): Promise<void> {
  // Load configuration
  const config: ServerConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  
  // Create commander program for CLI options
  const program = new Command();
  
  if (config.description) {
    program.description(config.description);
  }
  
  // Dynamically add options from config
  config.options.forEach(option => {
    const envValue = option.env ? process.env[option.env] : undefined;
    const defaultValue = option.default || envValue;
    
    if (option.type === 'boolean') {
      const boolDefault = envValue === 'true' || option.default === 'true';
      program.option(option.flag, option.description, boolDefault);
    } else {
      program.option(option.flag, option.description, defaultValue);
    }
  });
  
  // Always add transport options regardless of server-config
  const transportTypeDefault = process.env.MCP_TRANSPORT_TYPE || 'stdio';
  program.option('--transport <type>', 'Transport type (stdio or sse)', transportTypeDefault);
  
  // Always add transport-port option regardless of server-config
  const transportPortDefault = process.env.MCP_TRANSPORT_PORT || '3000';
  program.option('--transport-port <number>', 'Port for network transports (e.g., SSE)', transportPortDefault);
  
  // Parse arguments
  program.parse(process.argv);
  const options = program.opts();
  
  // Initialize settings from CLI args
  const settings = serverModule.Settings.fromArgs(options);
  serverModule.Settings.setSettings(settings);
  
  // Determine transport type from options or environment variable
  const transportType = (options.transport || process.env.MCP_TRANSPORT_TYPE || 'stdio').toLowerCase() === 'sse' ? 'sse' : 'stdio';
  
  // Always try to read transport-port from CLI args or environment variable
  const transportPort = options.transportPort 
    ? parseInt(options.transportPort, 10) 
    : process.env.MCP_TRANSPORT_PORT
      ? parseInt(process.env.MCP_TRANSPORT_PORT, 10)
      : 3000;
  
  if (transportType === 'sse') {
    // Launch SSE server
    await launchSSEServer(config, serverModule, transportPort);
  } else {
    // Start stdio server
    const transport = new StdioServerTransport();
    await serverModule.server.connect(transport);
    
    console.error(`${config.name} running on stdio transport. Version: ${serverModule.pkg.version}`);
    console.error(`Transport type: stdio`);
  }
}

/**
 * Launch an MCP server with SSE transport
 * @param config Server configuration
 * @param serverModule The server module containing server, Settings, and pkg
 * @param port Port to listen on
 */
async function launchSSEServer(
  config: ServerConfig,
  serverModule: ServerModule,
  port: number
): Promise<void> {
  // Map to store transports by session ID
  const transports: Record<string, StreamableHTTPServerTransport> = {};
  
  // Create HTTP server for SSE
  const server = http.createServer(async (req, res) => {
    // Handle requests to the root URL
    if (req.url === '/' || req.url === '/mcp') {
      // Get the session ID from headers
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      
      // Handle different request methods
      if (req.method === 'POST') {
        // For POST requests, need to parse the body
        const chunks: Buffer[] = [];
        
        try {
          // Read the request body
          for await (const chunk of req) {
            chunks.push(Buffer.from(chunk));
          }
          const bodyBuffer = Buffer.concat(chunks);
          let body;
          
          // Try to parse JSON body
          try {
            const bodyText = bodyBuffer.toString('utf8');
            if (bodyText) {
              body = JSON.parse(bodyText);
            }
          } catch (err) {
            console.error('Error parsing request body:', err);
          }
          
          let transport: StreamableHTTPServerTransport;
          
          if (sessionId && transports[sessionId]) {
            // Reuse existing transport for the session
            transport = transports[sessionId];
            
            // Initialize settings from headers if available and fromHeaders is implemented
            if (serverModule.Settings.fromHeaders) {
              const settings = serverModule.Settings.fromHeaders(headersToEnvVars(req.headers, config));
              serverModule.Settings.setSettings(settings);
            }
          } else if (!sessionId && body && body.method === 'initialize') {
            // New initialization request
            transport = new StreamableHTTPServerTransport({
              sessionIdGenerator: () => randomUUID(),
              onsessioninitialized: (sid: string) => {
                // Store the transport by session ID
                transports[sid] = transport;
              }
            });
            
            // Clean up transport when closed
            (transport as any).onclose = () => {
              const sid = (transport as any).sessionId;
              if (sid) {
                delete transports[sid];
              }
            };
            
            // Initialize settings from headers if available and fromHeaders is implemented
            if (serverModule.Settings.fromHeaders) {
              const settings = serverModule.Settings.fromHeaders(headersToEnvVars(req.headers, config));
              serverModule.Settings.setSettings(settings);
            }
            
            // Connect to the MCP server - only needed for new transports
            await serverModule.server.connect(transport)
              .catch((error: Error) => {
                console.error('Error connecting to SSE transport:', error);
              });
          } else {
            // Invalid request
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              jsonrpc: '2.0',
              error: {
                code: -32000,
                message: 'Bad Request: No valid session ID provided',
              },
              id: null,
            }));
            return;
          }
          
          // Handle the request with parsed body
          await transport.handleRequest(req, res, body);
        } catch (error) {
          console.error('Error handling POST request:', error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            jsonrpc: '2.0',
            error: {
              code: -32000,
              message: 'Internal server error: ' + (error as Error).message,
            },
            id: null,
          }));
        }
      } else if (req.method === 'GET') {
        // GET requests for SSE streaming
        if (!sessionId || !transports[sessionId]) {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end('Invalid or missing session ID');
          return;
        }
        
        const transport = transports[sessionId];
        await transport.handleRequest(req, res);
      } else if (req.method === 'DELETE') {
        // DELETE requests for session termination
        if (!sessionId || !transports[sessionId]) {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end('Invalid or missing session ID');
          return;
        }
        
        const transport = transports[sessionId];
        await transport.handleRequest(req, res);
      } else {
        // Unsupported methods
        res.writeHead(405, { 'Content-Type': 'text/plain', 'Allow': 'GET, POST, DELETE' });
        res.end('Method not allowed');
      }
    } else if (req.url === '/health' || req.url === '/status') {
      // Handle health checks
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        status: 'ok',
        server: config.name,
        version: serverModule.pkg.version,
        activeSessions: Object.keys(transports).length
      }));
    } else {
      // 404 for unknown routes
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    }
  });
  
  // Start HTTP server
  server.listen(port, () => {
    console.error(`${config.name} running on SSE transport at http://localhost:${port}. Version: ${serverModule.pkg.version}`);
    console.error(`Transport type: sse, Transport-port: ${port}`);
  });
  
  // Handle server errors
  server.on('error', (err) => {
    console.error(`Server error: ${err.message}`);
  });
}

/**
 * Convert HTTP headers to environment variable format
 * Map headers to the environment variables defined in the server config
 * @param headers HTTP headers object
 * @param config Optional server config to use for mapping
 * @returns Headers converted to environment variable format
 */
function headersToEnvVars(
  headers: http.IncomingHttpHeaders, 
  config?: ServerConfig
): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {};
  
  // First, convert all headers to uppercase with underscores
  for (const [name, value] of Object.entries(headers)) {
    if (value !== undefined) {
      // Convert header names to environment variable format (UPPER_CASE)
      const envName = name.toUpperCase().replace(/-/g, '_');
      result[envName] = value;
    }
  }
  
  // If we have a config, try to map header values to the environment variables defined in the config
  if (config && config.options) {
    // Create a map of lowercase header name -> env var name
    const headerToEnvMap: Record<string, string> = {};
    
    // Build a mapping from header keys to environment variable names based on config
    for (const option of config.options) {
      if (option.env) {
        // Create mappings for different formats of the same option
        const flagName = option.flag
          .split(' ')[0]                   // Extract just the flag part (e.g., --api-key from --api-key <key>)
          .replace(/^--?/, '')             // Remove leading -- or -
          .replace(/-/g, '_');             // Convert dashes to underscores
          
        headerToEnvMap[flagName.toLowerCase()] = option.env;
        
        // Also map the env name to itself (in case header is already in env var format)
        headerToEnvMap[option.env.toLowerCase()] = option.env;
      }
    }
    
    // Look for headers that match our config options
    for (const [headerName, headerValue] of Object.entries(headers)) {
      if (headerValue !== undefined) {
        const normalizedHeaderName = headerName.toLowerCase().replace(/-/g, '_');
        const envVarName = headerToEnvMap[normalizedHeaderName];
        
        if (envVarName) {
          // We found a matching environment variable in the config
          result[envVarName] = headerValue;
        }
      }
    }
  }
  
  return result;
}

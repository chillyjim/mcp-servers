// API client implementation for Check Point MCP servers
import axios from 'axios';
import https from 'https';

function getMainPackageUserAgent(): string {
  if (process.env.CP_MCP_MAIN_PKG) {
    return process.env.CP_MCP_MAIN_PKG;
  }
  return "Check Point MCP API Client/v1.0";
}

// Constants for API URLs
export const ON_PREM_CI_BASE_URL = "{}/{}/api/v2/environments/{}/web_api";

/**
 * Response from an API client call
 */
export class ClientResponse {
  constructor(
    public status: number,
    public response: Record<string, any>
  ) {}
}

/**
 * Base class for API clients
 */
export abstract class APIClientBase {
  protected sid: string | null = null;
  
  constructor(
    protected readonly apiKey: string,
  ) {}

  /**
   * Get the host URL for the API client
   */
  abstract getHost(): string;
    /**
   * Create an API client instance - generic method for creating clients
   */
  static create<T extends APIClientBase>(this: new (...args: any[]) => T, ...args: any[]): T {
    return new this(...args);
  }

  /**
   * Get headers for the API requests
   */
  protected getHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json", 
      "X-chkp-sid": this.sid || "",
      "User-Agent": getMainPackageUserAgent(),
    };
  }

  /**
   * Call an API endpoint
   */
  async callApi(
    method: string,
    uri: string,
    data: Record<string, any>,
    params?: Record<string, any>
  ): Promise<ClientResponse> {
    if (!this.sid) {
      this.sid = await this.loginWithApiKey();
    }
    
    return await APIClientBase.makeRequest(
      this.getHost(),
      method,
      uri,
      data,
      this.getHeaders(),
      params
    );
  }

  /**
   * Login to the API using the API key
   */
  async loginWithApiKey(): Promise<string> {
    console.error("Logging in with API key");
    
    const loginResp = await APIClientBase.makeRequest(
      this.getHost(),
      "POST",
      "login",
      { "api-key": this.apiKey },
      { "Content-Type": "application/json" }
    );
    
    return loginResp.response.sid;
  }

  /**
   * Make a request to a Check Point API
   */  static async makeRequest(
    host: string,
    method: string,
    uri: string,
    data: Record<string, any>,
    headers: Record<string, string> = {},
    params: Record<string, any> | null = null,
    httpsAgent?: https.Agent
  ): Promise<ClientResponse> {
    // Ensure uri doesn't start with a slash
    uri = uri.replace(/^\//, "");
    const url = `${host}/${uri}`;    
    const config: any = {
      method: method.toUpperCase(),
      url,
      headers,
      params: params || undefined
    };
    
    // Add httpsAgent if provided (for handling self-signed certificates)
    if (httpsAgent) {
      config.httpsAgent = httpsAgent;
    }

    // Only set data for non-GET requests
    if (method.toUpperCase() !== 'GET' && data !== undefined) {
      config.data = data;
    }
    
    // Get settings to check if verbose mode is enabled
    const settings = (globalThis as any).cpMcpSettings as import('./settings').Settings | undefined;
    const verbose = settings?.verbose || false;
    
    // Always log the URL for our debug API
    if (verbose) {
      console.error(`🌐 API Request: ${method} ${url}`);
      console.error('Headers: ' + JSON.stringify(headers));
      console.error('Params: ' + JSON.stringify(params));
      console.error('Data: ' + JSON.stringify(data));
    } else {
      console.error(`🌐 API Request: ${method} ${url}`);
    }

    try {
      const response = await axios(config);
      
      if (verbose) {
        console.error(`✅ API Response (${response.status}):`);
        console.error('Headers: ' + JSON.stringify(response.headers));
        console.error('Data: ' + JSON.stringify(response.data));
      }
      
      return new ClientResponse(response.status, response.data as Record<string, any>);
    } catch (error: any) {
      if (verbose && error.response) {
        console.error(`❌ API Error (${error.response.status}):`);
        console.error('Headers:', error.response.headers);
        console.error('Data:', error.response.data);
      }
      
      if (error.response) {
        throw new Error(`API request failed: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }
}

/**
 * API client for Smart One Cloud
 */
export class SmartOneCloudAPIClient extends APIClientBase {
  constructor(
    apiKey: string,
    private readonly s1cUrl: string
  ) {
    super(apiKey);
  }

  getHost(): string {
    return this.s1cUrl;
  }
}

/**
 * API client for on-premises management server
 * Allows self-signed certificates and username/password authentication
 */
export class OnPremAPIClient extends APIClientBase {
  private readonly username?: string;
  private readonly password?: string;

  constructor(
    apiKey: string | undefined,
    private readonly managementHost: string,
    private readonly managementPort: string = "443",
    username?: string,
    password?: string
  ) {
    super(apiKey || ""); // APIClientBase requires apiKey, but we'll handle empty case
    this.username = username;
    this.password = password;
  }

  getHost(): string {
    const managementHost =  this.managementHost;
    const port = this.managementPort;
    return `https://${managementHost}:${port}/web_api`;
  }
  
  /**
   * Override callApi to allow self-signed certificates for on-prem only
   */
  async callApi(
    method: string,
    uri: string,
    data: Record<string, any>,
    params?: Record<string, any>
  ): Promise<ClientResponse> {
    if (!this.sid) {
      this.sid = await this.loginWithApiKey();
    }
    
    // Allow self-signed certs for on-prem management servers
    const httpsAgent = new https.Agent({ rejectUnauthorized: false });
    
    // Pass the httpsAgent to makeRequest
    return await APIClientBase.makeRequest(
      this.getHost(),
      method,
      uri,
      data,
      this.getHeaders(),
      params,
      httpsAgent
    );
  }
    /**
   * Override loginWithApiKey to support both api-key and username/password authentication
   * and allow self-signed certificates
   */
  async loginWithApiKey(): Promise<string> {
    // Determine if we're using API key or username/password
    const isUsingApiKey = !!this.apiKey;
    const isUsingCredentials = !!(this.username && this.password);
    
    if (!isUsingApiKey && !isUsingCredentials) {
      throw new Error("Authentication failed: No API key or username/password provided");
    }
    
    // Log authentication method
    if (isUsingApiKey) {
      console.error("Logging in with API key (allowing self-signed certificates)");
    } else {
      console.error("Logging in with username/password (allowing self-signed certificates)");
    }
    
    // Allow self-signed certs for on-prem management servers
    const httpsAgent = new https.Agent({ rejectUnauthorized: false });
    
    // Prepare login payload based on authentication method
    const loginPayload = isUsingApiKey 
      ? { "api-key": this.apiKey } 
      : { "user": this.username, "password": this.password };
    
    const loginResp = await APIClientBase.makeRequest(
      this.getHost(),
      "POST",
      "login",
      loginPayload,
      { "Content-Type": "application/json" },
      null,
      httpsAgent
    );
    
    return loginResp.response.sid;
  }
}

// API client implementation for Check Point MCP servers
import axios from 'axios';
import https from 'https';

function getMainPackageUserAgent(): string {
  if (process.env.CP_MCP_MAIN_PKG) {
    if (process.env.CP_MCP_MAIN_PKG.includes("quantum-management-mcp")) {
      return "mgmt-mcp";
    }
  }
  return "Check Point MCP API Client";
}

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
  private static _instance: APIClientBase;
  protected sid: string | null = null;
  protected sessionTimeout: number | null = null; // in seconds
  protected sessionStart: number | null = null;   // timestamp when session was created

  
  constructor(
    protected readonly apiKey: string,
  ) {
    if (APIClientBase._instance) {
      return APIClientBase._instance;
    }
    APIClientBase._instance = this;
  }

  /**
   * Reset the singleton instance (useful for testing)
   */
  static resetInstance(): void {
    APIClientBase._instance = null as unknown as APIClientBase;
  }

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
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": getMainPackageUserAgent(),
    };
    
    // Only add the X-chkp-sid header if we have a valid session ID
    if (this.sid) {
      headers["X-chkp-sid"] = this.sid;
    }
    
    return headers;
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

    if (!this.sid || this.isSessionExpired()) {
      try {
        this.sid = await this.login();
      }
      catch (error: any) {
        // If the error is already a ClientResponse, just return it directly
        if (error instanceof ClientResponse) {
          console.error(`Login failed with status ${error.status}:`, error.response);
          return error;
        }
        // For other types of errors, create a generic response
        console.error("Login failed with unexpected error:", error);
        return new ClientResponse(500, { error: "Authentication failed", message: error.message });
      }
    }

    let httpsAgent;
    if (this instanceof OnPremAPIClient) {
      // Allow self-signed certs for on-prem management servers
      httpsAgent = new https.Agent({ rejectUnauthorized: false });
    }


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
   * Check if the session is expired based on sessionTimeout and sessionStart
   */
  protected isSessionExpired(): boolean {
    if (!this.sid || !this.sessionTimeout || !this.sessionStart) return true;
    const now = Date.now();
    // Add a small buffer (5 seconds) to avoid edge cases
    return now > (this.sessionStart + (this.sessionTimeout - 5) * 1000);
  }

  /**
   * Login to the API using the API key
   */
  async login(): Promise<string> {
    const loginResp = await APIClientBase.makeRequest(
      this.getHost(),
      "POST",
      "login",
      { "api-key": this.apiKey },
      { "Content-Type": "application/json" }
    );
    if (loginResp.status !== 200 || !loginResp.response || !loginResp.response.sid) {
      throw loginResp;
    }

    this.sessionTimeout = loginResp.response["session-timeout"] || null;
    this.sessionStart = Date.now();
    
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

    console.error(`API Request: ${method} ${url}`);

    try {
      const response = await axios(config);
      return new ClientResponse(response.status, response.data as Record<string, any>);
    } catch (error: any) {
      if (error.response) {
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
   * Override login() to support both api-key and username/password authentication
   * and allow self-signed certificates
   */
  async login(): Promise<string> {
    // Determine if we're using API key or username/password
    const isUsingApiKey = !!this.apiKey;
    const isUsingCredentials = !!(this.username && this.password);
    
    if (!isUsingApiKey && !isUsingCredentials) {
      // Create and throw a ClientResponse directly for credential errors
      throw new ClientResponse(
        401, 
        { message: "Authentication failed: No API key or username/password provided" }
      );
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

    if (loginResp.status !== 200 || !loginResp.response || !loginResp.response.sid) {
      throw loginResp;
    }

    this.sessionTimeout = loginResp.response["session-timeout"] || null;
    this.sessionStart = Date.now();
    this.sid = loginResp.response.sid;

    return loginResp.response.sid;
  }
}

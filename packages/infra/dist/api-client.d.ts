import https from 'https';
export declare const ON_PREM_CI_BASE_URL = "{}/{}/api/v2/environments/{}/web_api";
/**
 * Response from an API client call
 */
export declare class ClientResponse {
    status: number;
    response: Record<string, any>;
    constructor(status: number, response: Record<string, any>);
}
/**
 * Base class for API clients
 */
export declare abstract class APIClientBase {
    protected readonly apiKey: string;
    protected sid: string | null;
    constructor(apiKey: string);
    /**
     * Get the host URL for the API client
     */
    abstract getHost(): string;
    /**
   * Create an API client instance - generic method for creating clients
   */
    static create<T extends APIClientBase>(this: new (...args: any[]) => T, ...args: any[]): T;
    /**
     * Get headers for the API requests
     */
    protected getHeaders(): Record<string, string>;
    /**
     * Call an API endpoint
     */
    callApi(method: string, uri: string, data: Record<string, any>, params?: Record<string, any>): Promise<ClientResponse>;
    /**
     * Login to the API using the API key
     */
    loginWithApiKey(): Promise<string>;
    /**
     * Make a request to a Check Point API
     */ static makeRequest(host: string, method: string, uri: string, data: Record<string, any>, headers?: Record<string, string>, params?: Record<string, any> | null, httpsAgent?: https.Agent): Promise<ClientResponse>;
}
/**
 * API client for Smart One Cloud
 */
export declare class SmartOneCloudAPIClient extends APIClientBase {
    private readonly s1cUrl;
    constructor(apiKey: string, s1cUrl: string);
    getHost(): string;
}
/**
 * API client for on-premises management server
 * Allows self-signed certificates and username/password authentication
 */
export declare class OnPremAPIClient extends APIClientBase {
    private readonly managementHost;
    private readonly managementPort;
    private readonly username?;
    private readonly password?;
    constructor(apiKey: string | undefined, managementHost: string, managementPort?: string, username?: string, password?: string);
    getHost(): string;
    /**
     * Override callApi to allow self-signed certificates for on-prem only
     */
    callApi(method: string, uri: string, data: Record<string, any>, params?: Record<string, any>): Promise<ClientResponse>;
    /**
   * Override loginWithApiKey to support both api-key and username/password authentication
   * and allow self-signed certificates
   */
    loginWithApiKey(): Promise<string>;
}
/**
 * API client for Harmony SASE
 */
export declare class HarmonySaseAPIClient extends APIClientBase {
    private readonly managementHost;
    private readonly origin;
    constructor(apiKey: string, managementHost: string, origin: string);
    getHost(): string;
    /**
     * Override the login method for Harmony SASE
     */
    loginWithApiKey(): Promise<string>;
    /**
     * Override the headers method for Harmony SASE
     */
    protected getHeaders(): Record<string, string>;
}
//# sourceMappingURL=api-client.d.ts.map
// API client implementation for Check Point MCP servers
import axios from 'axios';
import https from 'https';
// Constants for API URLs
export const ON_PREM_CI_BASE_URL = "{}/{}/api/v2/environments/{}/web_api";
/**
 * Response from an API client call
 */
export class ClientResponse {
    constructor(status, response) {
        this.status = status;
        this.response = response;
    }
}
/**
 * Base class for API clients
 */
export class APIClientBase {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.sid = null;
    }
    /**
   * Create an API client instance - generic method for creating clients
   */
    static create(...args) {
        return new this(...args);
    }
    /**
     * Get headers for the API requests
     */
    getHeaders() {
        return {
            "Content-Type": "application/json",
            "X-chkp-sid": this.sid || ""
        };
    }
    /**
     * Call an API endpoint
     */
    async callApi(method, uri, data, params) {
        if (!this.sid) {
            this.sid = await this.loginWithApiKey();
        }
        return await APIClientBase.makeRequest(this.getHost(), method, uri, data, this.getHeaders(), params);
    }
    /**
     * Login to the API using the API key
     */
    async loginWithApiKey() {
        console.error("Logging in with API key");
        const loginResp = await APIClientBase.makeRequest(this.getHost(), "POST", "login", { "api-key": this.apiKey }, { "Content-Type": "application/json" });
        return loginResp.response.sid;
    }
    /**
     * Make a request to a Check Point API
     */ static async makeRequest(host, method, uri, data, headers = {}, params = null, httpsAgent) {
        // Ensure uri doesn't start with a slash
        uri = uri.replace(/^\//, "");
        const url = `${host}/${uri}`;
        const config = {
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
        const settings = globalThis.cpMcpSettings;
        const verbose = settings?.verbose || false;
        // Always log the URL for our debug API
        if (verbose) {
            console.error(`🌐 API Request: ${method} ${url}`);
            console.error('Headers: ' + JSON.stringify(headers));
            console.error('Params: ' + JSON.stringify(params));
            console.error('Data: ' + JSON.stringify(data));
        }
        else {
            console.error(`🌐 API Request: ${method} ${url}`);
        }
        try {
            const response = await axios(config);
            if (verbose) {
                console.error(`✅ API Response (${response.status}):`);
                console.error('Headers: ' + JSON.stringify(response.headers));
                console.error('Data: ' + JSON.stringify(response.data));
            }
            return new ClientResponse(response.status, response.data);
        }
        catch (error) {
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
    constructor(apiKey, s1cUrl) {
        super(apiKey);
        this.s1cUrl = s1cUrl;
    }
    getHost() {
        return this.s1cUrl;
    }
}
/**
 * API client for on-premises management server
 * Allows self-signed certificates and username/password authentication
 */
export class OnPremAPIClient extends APIClientBase {
    constructor(apiKey, managementHost, managementPort = "443", username, password) {
        super(apiKey || ""); // APIClientBase requires apiKey, but we'll handle empty case
        this.managementHost = managementHost;
        this.managementPort = managementPort;
        this.username = username;
        this.password = password;
    }
    getHost() {
        const managementHost = this.managementHost;
        const port = this.managementPort;
        return `https://${managementHost}:${port}/web_api`;
    }
    /**
     * Override callApi to allow self-signed certificates for on-prem only
     */
    async callApi(method, uri, data, params) {
        if (!this.sid) {
            this.sid = await this.loginWithApiKey();
        }
        // Allow self-signed certs for on-prem management servers
        const httpsAgent = new https.Agent({ rejectUnauthorized: false });
        // Pass the httpsAgent to makeRequest
        return await APIClientBase.makeRequest(this.getHost(), method, uri, data, this.getHeaders(), params, httpsAgent);
    }
    /**
   * Override loginWithApiKey to support both api-key and username/password authentication
   * and allow self-signed certificates
   */
    async loginWithApiKey() {
        // Determine if we're using API key or username/password
        const isUsingApiKey = !!this.apiKey;
        const isUsingCredentials = !!(this.username && this.password);
        if (!isUsingApiKey && !isUsingCredentials) {
            throw new Error("Authentication failed: No API key or username/password provided");
        }
        // Log authentication method
        if (isUsingApiKey) {
            console.error("Logging in with API key (allowing self-signed certificates)");
        }
        else {
            console.error("Logging in with username/password (allowing self-signed certificates)");
        }
        // Allow self-signed certs for on-prem management servers
        const httpsAgent = new https.Agent({ rejectUnauthorized: false });
        // Prepare login payload based on authentication method
        const loginPayload = isUsingApiKey
            ? { "api-key": this.apiKey }
            : { "user": this.username, "password": this.password };
        const loginResp = await APIClientBase.makeRequest(this.getHost(), "POST", "login", loginPayload, { "Content-Type": "application/json" }, null, httpsAgent);
        return loginResp.response.sid;
    }
}
/**
 * API client for Harmony SASE
 */
export class HarmonySaseAPIClient extends APIClientBase {
    constructor(apiKey, managementHost, origin) {
        super(apiKey);
        this.managementHost = managementHost;
        this.origin = origin;
    }
    getHost() {
        return this.managementHost;
    }
    /**
     * Override the login method for Harmony SASE
     */
    async loginWithApiKey() {
        console.error("Logging in to Harmony SASE with API key");
        const loginResp = await APIClientBase.makeRequest(this.getHost(), "POST", "v1/auth/authorize", {
            apiKey: this.apiKey,
            grantType: "api_key"
        }, {
            "Content-Type": "application/json",
            "accept": "application/json"
        });
        return loginResp.response.data.accessToken;
    }
    /**
     * Override the headers method for Harmony SASE
     */
    getHeaders() {
        return {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${this.sid}`,
            "Origin": this.origin
        };
    }
}

import { APIClientBase } from './api-client.js';
/**
 * Base class for API managers
 */
export declare abstract class APIManagerBase {
    protected readonly client: APIClientBase;
    protected requestInfo: any;
    protected detailsLevel: 'full' | 'standard' | 'uid';
    constructor(client: APIClientBase);
    /**
     * Call an API endpoint
     */
    callApi(method: string, uri: string, data: Record<string, any>): Promise<Record<string, any>>;
    /**
     * Create an API manager instance
     */
    static create(args: any): APIManagerBase;
    /**
     * Run a script on a target gateway
     */
    runScript(targetGateway: string, scriptName: string, script: string): Promise<[boolean, Record<string, any>]>;
    /**
     * Get the result of a task
     */
    getTaskResult(taskId: string, maxRetries?: number): Promise<[boolean, string]>;
}
/**
 * API manager for authentication (API key or username/password)
 */
export declare class APIManagerForAPIKey extends APIManagerBase {
    static create(args: {
        api_key?: string;
        username?: string;
        password?: string;
        management_host?: string;
        management_port?: string;
        s1c_url?: string;
    }): APIManagerForAPIKey;
}
/**
 * API manager for Harmony SASE
 */
export declare class APIManagerForHarmonySASE extends APIManagerBase {
    static create(args: {
        api_key: string;
        management_host: string;
        origin: string;
    }): APIManagerForHarmonySASE;
}
//# sourceMappingURL=api-manager.d.ts.map
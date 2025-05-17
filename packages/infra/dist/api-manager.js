// API manager implementation for Check Point MCP servers
import { SmartOneCloudAPIClient, OnPremAPIClient, HarmonySaseAPIClient } from './api-client.js';
/**
 * Base class for API managers
 */
export class APIManagerBase {
    constructor(client) {
        this.client = client;
        this.requestInfo = null;
        this.detailsLevel = 'full';
    }
    /**
     * Call an API endpoint
     */
    async callApi(method, uri, data) {
        const clientResponse = await this.client.callApi(method, uri, data, undefined);
        return clientResponse.response;
    }
    /**
     * Create an API manager instance
     */
    static create(args) {
        throw new Error('Method must be implemented by subclass');
    }
    /**
     * Run a script on a target gateway
     */
    async runScript(targetGateway, scriptName, script) {
        const payload = {
            'script-name': scriptName,
            'script': script,
            'targets': [targetGateway]
        };
        const resp = await this.callApi('post', 'run-script', payload);
        if (!resp.tasks) {
            return [false, { message: "Failed to run the script" }];
        }
        return [true, { tasks: resp.tasks.map((task) => task['task-id']) }];
    }
    /**
     * Get the result of a task
     */
    async getTaskResult(taskId, maxRetries = 5) {
        let retries = 0;
        while (retries < maxRetries) {
            const payload = {
                'task-id': taskId,
                'details-level': 'full'
            };
            const response = await this.callApi('post', 'show-task', payload);
            const taskDetails = response.tasks?.[0];
            if (taskDetails?.status === 'succeeded' || taskDetails?.status === 'failed') {
                if (taskDetails['task-details']?.[0]?.responseMessage) {
                    const responseMessageBase64 = taskDetails['task-details'][0].responseMessage;
                    const decoded = Buffer.from(responseMessageBase64, 'base64').toString('utf-8');
                    return [taskDetails.status === 'succeeded', decoded];
                }
                return [false, "failed to get task result"];
            }
            else {
                retries++;
                await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second between checks
            }
        }
        return [false, "Task did not complete in time"];
    }
}
/**
 * API manager for authentication (API key or username/password)
 */
export class APIManagerForAPIKey extends APIManagerBase {
    static create(args) {
        // For on-prem management - supports both API key and username/password
        if (args.management_host) {
            // Create an OnPremAPIClient with username/password support
            const onPremClient = new OnPremAPIClient(args.api_key, args.management_host, args.management_port || '443', args.username, args.password);
            return new this(onPremClient);
        }
        // For cloud management (S1C) - only supports API key
        if (!args.api_key) {
            throw new Error("API key is required for SmartOneCloud authentication");
        }
        return new this(SmartOneCloudAPIClient.create(args.api_key, args.s1c_url));
    }
}
/**
 * API manager for Harmony SASE
 */
export class APIManagerForHarmonySASE extends APIManagerBase {
    static create(args) {
        return new this(HarmonySaseAPIClient.create(args.api_key, args.management_host, args.origin));
    }
}

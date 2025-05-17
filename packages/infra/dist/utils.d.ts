import { APIManagerBase } from './api-manager.js';
/**
 * Server types for API connections
 */
export declare enum ServerType {
    MANAGEMENT = "management",
    HARMONY_SASE = "harmony_sase"
}
/**
 * Get an API manager for the specified server type
 */
export declare function getApiManager(serverType?: ServerType): Promise<APIManagerBase>;
/**
 * Call the management API
 */
export declare function callManagementApi(method?: string, uri?: string, params?: Record<string, any>): Promise<Record<string, any>>;
//# sourceMappingURL=utils.d.ts.map
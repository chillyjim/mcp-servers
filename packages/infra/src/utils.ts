// Utility functions for MCP servers
import { APIManagerBase, APIManagerForAPIKey } from './api-manager.js';
import { Settings } from './settings.js';

/**
 * Get an API manager according to the management settings
 */
export async function getApiManager(): Promise<APIManagerBase> {
  const settings = Settings.getSettings();

  if (settings.s1cUrl) {
    console.error('Using S1C With API Key from settings');
    return APIManagerForAPIKey.create({
      api_key: settings.apiKey,
      s1c_url: settings.s1cUrl,
    });
  }
    if (settings.managementHost) {
    console.error('Using on prem management host and port from settings');
    // Check what authentication method is available
    if (settings.apiKey) {
      console.error('Authenticating with API key');
      return APIManagerForAPIKey.create({
        api_key: settings.apiKey,
        management_host: settings.managementHost,
        management_port: settings.managementPort || '443',
      });
    } else if (settings.username && settings.password) {
      console.error('Authenticating with username/password');
      return APIManagerForAPIKey.create({
        username: settings.username,
        password: settings.password,
        management_host: settings.managementHost,
        management_port: settings.managementPort || '443',
      });
    } else {
      throw new Error('Missing authentication credentials. Provide either API key or username/password for on-prem management.');
    }
  }
  
  throw new Error('Missing tenant details.');
}

/**
 * Call the management API
 */
export async function callManagementApi(
  method: string = 'POST',
  uri: string = '',
  params: Record<string, any> = {}
): Promise<Record<string, any>> {
  const s1cManager = await getApiManager();
  const data: Record<string, any> = {};
  
  // Convert snake_case to kebab-case for API parameters
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === '') {
      continue;
    }
    const safeKey = key.replace(/_/g, '-');
    data[safeKey] = value;
  }

  return await s1cManager.callApi(method, uri, data);
}

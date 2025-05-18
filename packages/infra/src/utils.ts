// Utility functions for MCP servers
import { APIManagerBase, APIManagerForAPIKey } from './api-manager.js';
import { Settings } from './settings.js';
import { nullOrEmpty } from './string-utils.js';

/**
 * Get an API manager according to the management settings
 */
export async function getApiManager(): Promise<APIManagerBase> {
  const settings = Settings.getSettings();

  if (!nullOrEmpty(settings.s1cUrl)) {
    console.error('Using Smart One Cloud');
    return APIManagerForAPIKey.create({
      api_key: settings.apiKey,
      s1c_url: settings.s1cUrl,
    });
  }
  if (!nullOrEmpty(settings.managementHost)) {
    // Check what authentication method is available
    if (!nullOrEmpty(settings.apiKey)) {
      console.error('Using on prem management with API key');
      return APIManagerForAPIKey.create({
        api_key: settings.apiKey,
        management_host: settings.managementHost,
        management_port: settings.managementPort || '443',
      });
    } else if (!nullOrEmpty(settings.username) && !nullOrEmpty(settings.password)) {
      console.error('Using on prem management with username/password');
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

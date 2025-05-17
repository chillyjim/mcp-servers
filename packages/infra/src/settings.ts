// Settings manager for MCP servers
import * as z from 'zod';

// Singleton instance for settings
let globalSettings: Settings | null = null;

/**
 * Settings for the MCP servers
 */
export class Settings {
  public apiKey?: string;
  public username?: string;
  public password?: string;
  public s1cUrl?: string;
  public managementHost?: string;
  public managementPort?: string;
  public origin?: string;
  public verbose: boolean = false;

  /**
   * Set the global settings instance
   */
  static setSettings(settings: Settings): void {
    globalSettings = settings;
    // Also set the global reference for access from other modules
    (globalThis as any).cpMcpSettings = settings;
  }

  /**
   * Get the global settings instance
   */
  static getSettings(): Settings {
    if (!globalSettings) {
      globalSettings = new Settings();
      // Also set the global reference for access from other modules
      (globalThis as any).cpMcpSettings = globalSettings;
    }
    return globalSettings;
  }
  constructor({
    apiKey = process.env.API_KEY,
    username = process.env.USERNAME,
    password = process.env.PASSWORD,
    s1cUrl = process.env.S1C_URL,
    managementHost = process.env.MANAGEMENT_HOST,
    managementPort = process.env.MANAGEMENT_PORT || '443',
    origin = process.env.ORIGIN,
    verbose = process.env.VERBOSE === 'true'
  }: {
    apiKey?: string;
    username?: string;
    password?: string;
    s1cUrl?: string;
    managementHost?: string;
    managementPort?: string;
    origin?: string;
    verbose?: boolean;
  } = {}) {
    this.apiKey = apiKey;
    this.username = username;
    this.password = password;
    this.s1cUrl = s1cUrl;
    this.managementHost = managementHost;
    this.managementPort = managementPort;
    this.origin = origin;
    this.verbose = verbose;
    
    this.validate();
  }
  /**
   * Validate the settings
   */
  private validate(): void {
    // For S1C, API key is required
    if (this.s1cUrl && !this.apiKey) {
      throw new Error('API key is required for S1C (via --api-key or API_KEY env var)');
    }

    // For on-prem, either API key or username/password is required
    if (this.managementHost && !this.apiKey && !(this.username && this.password)) {
      throw new Error('Either API key or username/password are required for on-prem management (via CLI args or env vars)');
    }

    // Need either management URL or management host
    if (!this.s1cUrl && !this.managementHost) {
      // This validation is commented out in the Python code, so we'll do the same
      // throw new Error(
      //   'You must provide either management URL (cloud) or management host (on-prem) via CLI or env vars'
      // );
    }
  }
  /**
   * Create settings from command-line arguments
   */
  static fromArgs(args: Record<string, any>): Settings {
    return new Settings({
      apiKey: args.apiKey,
      username: args.username,
      password: args.password,
      s1cUrl: args.s1cUrl,
      managementHost: args.managementHost,
      managementPort: args.managementPort,
      origin: args.origin,
      verbose: args.verbose
    });
  }
}

/**
 * Settings for the MCP servers
 */
export declare class Settings {
    apiKey?: string;
    username?: string;
    password?: string;
    s1cUrl?: string;
    managementHost?: string;
    managementPort?: string;
    origin?: string;
    verbose: boolean;
    /**
     * Set the global settings instance
     */
    static setSettings(settings: Settings): void;
    /**
     * Get the global settings instance
     */
    static getSettings(): Settings;
    constructor({ apiKey, username, password, s1cUrl, managementHost, managementPort, origin, verbose }?: {
        apiKey?: string;
        username?: string;
        password?: string;
        s1cUrl?: string;
        managementHost?: string;
        managementPort?: string;
        origin?: string;
        verbose?: boolean;
    });
    /**
     * Validate the settings
     */
    private validate;
    /**
     * Create settings from command-line arguments
     */
    static fromArgs(args: Record<string, any>): Settings;
}
//# sourceMappingURL=settings.d.ts.map
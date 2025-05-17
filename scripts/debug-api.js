#!/usr/bin    // Define CLI options with environment variable fallbacks
    program
        .name('debug-api')
        .description('Debug utility to call the Check Point Management API (Smart-1 Cloud or On-Prem)')
        .option('-k, --api-key <key>', 'API key for authentication', process.env.API_KEY)
        .option('-u, --username <username>', 'Username for on-prem authentication', process.env.USERNAME)
        .option('-p, --password <password>', 'Password for on-prem authentication', process.env.PASSWORD)
        .option('-t, --tenant-name <n>', 'Tenant name (for cloud)', process.env.TENANT_NAME)
        .option('-s, --tenant-secret <secret>', 'Tenant secret (for cloud)', process.env.TENANT_SECRET)
        .option('-m, --management-host <host>', 'Management host (for on-prem)', process.env.MANAGEMENT_HOST)
        .option('-r, --management-port <port>', 'Port for on-prem API', process.env.MANAGEMENT_PORT || '443')
        .option('-v, --verbose', 'Enable verbose output', process.env.VERBOSE === 'true')
        .option('-h, --help', 'Display help');
// Debug script to test the infra package by sending a show-hosts request
import { callManagementApi } from '@chkp/genai-mcp-server-infra';
import { Settings } from '@chkp/genai-mcp-server-infra';
import { Command } from 'commander';

async function main() {
    const program = new Command();

    // Define CLI options with environment variable fallbacks
    program
        .name('debug-api')
        .description('Debug utility to call the Check Point Management API (Smart-1 Cloud or On-Prem)')
        .option('-k, --api-key <key>', 'API key for authentication', process.env.API_KEY)
        .option('-t, --tenant-name <name>', 'Tenant name (for cloud)', process.env.TENANT_NAME)
        .option('-s, --tenant-secret <secret>', 'Tenant secret (for cloud)', process.env.TENANT_SECRET)
        .option('-m, --management-host <host>', 'Management host (for on-prem)', process.env.MANAGEMENT_HOST)
        .option('-p, --management-port <port>', 'Port for on-prem API', process.env.MANAGEMENT_PORT || '443')
        .option('-v, --verbose', 'Enable verbose output', process.env.VERBOSE === 'true')
        .option('-h, --help', 'Display help');    program.on('--help', () => {
        console.log('');
        console.log('Examples:');
        console.log('  $ debug-api --api-key abc123 --tenant-name mytenant --tenant-secret mysecret');
        console.log('  $ API_KEY=abc123 TENANT_NAME=mytenant TENANT_SECRET=mysecret debug-api');
        console.log('  $ debug-api --api-key abc123 --management-host 192.0.2.1');
        console.log('  $ debug-api --username admin --password mypass --management-host 192.0.2.1');
        console.log('');
        console.log('Note: You must specify either tenant credentials (for Smart-1 Cloud) or a management host (on-prem) with either API key or username/password.');
    });

    program.parse(process.argv);
    const options = program.opts();    // Validate required fields based on connection type
    if (options.tenantName || options.tenantSecret) {
        // For S1C, API key is required
        if (!options.apiKey) {
            console.error('❌ Error: API key is required for Smart-1 Cloud.');
            program.help({ error: true });
        }
        
        // Both tenant name and secret are required for S1C
        if (!(options.tenantName && options.tenantSecret)) {
            console.error('❌ Error: Both tenant name and secret are required for Smart-1 Cloud.');
            program.help({ error: true });
        }
    } else if (options.managementHost) {
        // For on-prem, either API key or username/password is required
        if (!options.apiKey && !(options.username && options.password)) {
            console.error('❌ Error: For on-prem management, provide either API key or both username and password.');
            program.help({ error: true });
        }
    } else {
        console.error('❌ Error: Provide either cloud credentials (tenant name and secret) or an on-prem management host.');
        program.help({ error: true });
    }    // Print input summary
    console.log('\n🔧 Running with:');
    console.log(`  API Key: ${options.apiKey ? '[secured]' : 'N/A'}`);
    console.log(`  Username: ${options.username || 'N/A'}`);
    console.log(`  Password: ${options.password ? '[secured]' : 'N/A'}`);
    console.log(`  Tenant Name: ${options.tenantName || 'N/A'}`);
    console.log('  Tenant Secret: [secured]');
    console.log(`  Management Host: ${options.managementHost || 'N/A'}`);
    console.log(`  Management Port: ${options.managementPort || '443'}`);
    console.log(`  Verbose: ${options.verbose ? 'Yes' : 'No'}`);
    console.log('');    // Create and apply settings
    const settings = new Settings({
        apiKey: options.apiKey,
        username: options.username,
        password: options.password,
        tenantName: options.tenantName,
        tenantSecret: options.tenantSecret,
        managementHost: options.managementHost,
        managementPort: options.managementPort,
        // @ts-ignore
        verbose: options.verbose
    });

    Settings.setSettings(settings);

    try {
        const currentSettings = Settings.getSettings();

        console.log('🔍 Connection details:');
        if (currentSettings.tenantName && currentSettings.tenantSecret) {
            console.log(`🌩️  API Type: Smart-1 Cloud`);
            console.log(`🌐 URL: https://${currentSettings.tenantName}.maas.checkpoint.com/${currentSettings.tenantSecret}/web_api`);
        } else {
            console.log(`🏠  API Type: On-Prem`);
            console.log(`🌐 URL: https://${currentSettings.managementHost}:${currentSettings.port}/web_api`);
        }

        const params = {
            limit: 10,
            offset: 0,
            details_level: 'standard'
        };

        console.log('\n🚀 Sending show-hosts request with params:', params);

        const result = await callManagementApi('POST', 'show-hosts', params);

        console.log('\n✅ API call successful!');
        console.log('📦 Response:', JSON.stringify(result, null, 2));

        if (result.objects?.length > 0) {
            console.log(`\n🔎 Found ${result.objects.length} host(s):`);
            result.objects.forEach((host, i) => {
                console.log(`${i + 1}. ${host.name} (${host['ipv4-address'] || 'No IP'})`);
            });
        } else {
            console.log('\nℹ️ No hosts found in the response.');
        }
    } catch (error) {
        console.error('\n❌ Error during API call:');
        if (error instanceof Error) {
            console.error(`${error.name}: ${error.message}`);
            console.error('🧵 Stack trace:', error.stack);
            const anyErr = error;
            if (anyErr.response) {
                console.error('\n📡 Response details:');
                console.error(`Status: ${anyErr.response.status}`);
                console.error(`Status Text: ${anyErr.response.statusText}`);
                console.error('Headers:', anyErr.response.headers);
                console.error('Data:', anyErr.response.data);
            }
        } else {
            console.error(error);
        }
    }
}

main().catch(console.error);

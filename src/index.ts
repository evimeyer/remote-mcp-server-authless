import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import axios from "axios";

// Import Meta Marketing API SDK
import * as bizSdk from 'facebook-nodejs-business-sdk';
const { FacebookAdsApi, User, AdAccount, Campaign, AdSet, Ad } = bizSdk;

// Meta Ads API Configuration
// Note: In a production environment, these values should be stored securely
// in environment variables and not hardcoded
const META_CONFIG = {
    appId: "2505469856465943",
    // This token should be kept secure and rotated regularly
    accessToken: "EAAjmtijKRBcBOy0iWzLJLkrwve4au3h4zhJ8L5svEQYdGcZCgIbzb6mlGEoIqiUi6sl2dQZCkkfesQETJX3gD0MGjuL28ZAONV4JgeDaH4i1MgY9HNMJeWRLzLDl79nJtT45TXv9aFeOaMcsMcOb7J4bj87Ipsyfi9cruRPT5BpvnXK5BZAcrNZBGQZBtZAnBlY"
};

// Meta Ads API types
interface MetaAdAccount {
    id: string;
    name: string;
    account_status: number;
    currency: string;
    timezone_name: string;
    amount_spent: string;
    [key: string]: any;
}

interface MetaCampaign {
    id: string;
    name: string;
    status: string;
    objective: string;
    [key: string]: any;
}

interface MetaAdSet {
    id: string;
    name: string;
    status: string;
    campaign_id: string;
    targeting: any;
    [key: string]: any;
}

interface Env {
    // Define environment variables if needed
}

// Define our MCP agent with tools
export class MyMCP extends McpAgent {
    server = new McpServer({
        name: "Calculator & Meta Ads Tool",
        version: "1.0.0",
    });

    async init() {
        // Simple addition tool
        this.server.tool(
            "add",
            { a: z.number(), b: z.number() },
            async ({ a, b }) => ({
                content: [{ type: "text", text: String(a + b) }],
            })
        );

        // Calculator tool with multiple operations
        this.server.tool(
            "calculate",
            {
                operation: z.enum(["add", "subtract", "multiply", "divide"]),
                a: z.number(),
                b: z.number(),
            },
            async ({ operation, a, b }) => {
                let result: number;
                switch (operation) {
                    case "add":
                        result = a + b;
                        break;
                    case "subtract":
                        result = a - b;
                        break;
                    case "multiply":
                        result = a * b;
                        break;
                    case "divide":
                        if (b === 0)
                            return {
                                content: [
                                    {
                                        type: "text",
                                        text: "Error: Cannot divide by zero",
                                    },
                                ],
                            };
                        result = a / b;
                        break;
                }
                return { content: [{ type: "text", text: String(result) }] };
            }
        );

        // Meta Ads Tools

        // Tool: Get Ad Accounts
        this.server.tool(
            "metaAdsGetAdAccounts",
            {
                userId: z.string().default("me"),
                limit: z.number().default(10)
            },
            async ({ userId, limit }) => {
                try {
                    // Initialize the Facebook Ads API with the access token
                    FacebookAdsApi.init(META_CONFIG.accessToken);

                    // Create a User object to fetch ad accounts
                    const user = new User(userId);

                    // Fetch ad accounts
                    const accounts = await user.getAdAccounts({
                        limit: limit,
                        fields: [
                            'id',
                            'name',
                            'account_status',
                            'amount_spent',
                            'balance',
                            'currency',
                            'timezone_name'
                        ]
                    });

                    // Process and format the response
                    const formattedAccounts = accounts.map((account: any) => ({
                        id: account.id,
                        name: account.name,
                        status: getAccountStatusText(account.account_status),
                        amount_spent: formatCurrency(account.amount_spent, account.currency),
                        balance: formatCurrency(account.balance, account.currency),
                        currency: account.currency,
                        timezone: account.timezone_name
                    }));

                    return {
                        content: [{
                            type: "text",
                            text: JSON.stringify({
                                success: true,
                                count: formattedAccounts.length,
                                accounts: formattedAccounts
                            }, null, 2)
                        }]
                    };
                } catch (error) {
                    console.error("Meta Ads API Error:", error);
                    return {
                        content: [{
                            type: "text",
                            text: JSON.stringify({
                                success: false,
                                error: error instanceof Error ? error.message : String(error)
                            }, null, 2)
                        }]
                    };
                }
            }
        );

        // Tool: Get Account Info
        this.server.tool(
            "metaAdsGetAccountInfo",
            {
                accountId: z.string()
            },
            async ({ accountId }) => {
                try {
                    // Initialize the Facebook Ads API with the access token
                    FacebookAdsApi.init(META_CONFIG.accessToken);

                    // Create an AdAccount object
                    const account = new AdAccount(accountId);

                    // Fetch detailed account information
                    const accountInfo = await account.read([
                        'id',
                        'name',
                        'account_status',
                        'amount_spent',
                        'balance',
                        'currency',
                        'timezone_name',
                        'funding_source',
                        'business_country_code',
                        'spend_cap',
                        'owner'
                    ]);

                    // Process and format the response
                    const formattedAccountInfo = {
                        id: accountInfo.id,
                        name: accountInfo.name,
                        status: getAccountStatusText(accountInfo.account_status),
                        amount_spent: formatCurrency(accountInfo.amount_spent, accountInfo.currency),
                        balance: formatCurrency(accountInfo.balance, accountInfo.currency),
                        currency: accountInfo.currency,
                        timezone: accountInfo.timezone_name,
                        country: accountInfo.business_country_code,
                        spend_cap: accountInfo.spend_cap ? formatCurrency(accountInfo.spend_cap, accountInfo.currency) : "No limit",
                        owner: accountInfo.owner
                    };

                    return {
                        content: [{
                            type: "text",
                            text: JSON.stringify({
                                success: true,
                                account: formattedAccountInfo
                            }, null, 2)
                        }]
                    };
                } catch (error) {
                    console.error("Meta Ads API Error:", error);
                    return {
                        content: [{
                            type: "text",
                            text: JSON.stringify({
                                success: false,
                                error: error instanceof Error ? error.message : String(error)
                            }, null, 2)
                        }]
                    };
                }
            }
        );

        // Tool: Get Campaigns
        this.server.tool(
            "metaAdsGetCampaigns",
            {
                accountId: z.string(),
                limit: z.number().default(10),
                statusFilter: z.string().optional()
            },
            async ({ accountId, limit, statusFilter }) => {
                try {
                    // Initialize the Facebook Ads API with the access token
                    FacebookAdsApi.init(META_CONFIG.accessToken);

                    // Create an AdAccount object
                    const account = new AdAccount(accountId);

                    // Prepare filtering if status filter is provided
                    let params: any = {
                        limit: limit,
                        fields: [
                            'id',
                            'name',
                            'objective',
                            'status',
                            'daily_budget',
                            'lifetime_budget',
                            'created_time',
                            'start_time',
                            'stop_time'
                        ]
                    };

                    if (statusFilter) {
                        params.filtering = [
                            {
                                field: 'campaign.delivery_status',
                                operator: 'EQUAL',
                                value: statusFilter
                            }
                        ];
                    }

                    // Fetch campaigns
                    const campaigns = await account.getCampaigns(params);

                    // Process and format the response
                    const formattedCampaigns = campaigns.map((campaign: any) => ({
                        id: campaign.id,
                        name: campaign.name,
                        objective: campaign.objective,
                        status: campaign.status,
                        daily_budget: campaign.daily_budget ? formatCurrency(campaign.daily_budget, '') : null,
                        lifetime_budget: campaign.lifetime_budget ? formatCurrency(campaign.lifetime_budget, '') : null,
                        created_time: campaign.created_time,
                        start_time: campaign.start_time,
                        stop_time: campaign.stop_time
                    }));

                    return {
                        content: [{
                            type: "text",
                            text: JSON.stringify({
                                success: true,
                                count: formattedCampaigns.length,
                                campaigns: formattedCampaigns
                            }, null, 2)
                        }]
                    };
                } catch (error) {
                    console.error("Meta Ads API Error:", error);
                    return {
                        content: [{
                            type: "text",
                            text: JSON.stringify({
                                success: false,
                                error: error instanceof Error ? error.message : String(error)
                            }, null, 2)
                        }]
                    };
                }
            }
        );

        // Tool: Get Campaign Details
        this.server.tool(
            "metaAdsGetCampaignDetails",
            {
                campaignId: z.string()
            },
            async ({ campaignId }) => {
                try {
                    // Initialize the Facebook Ads API with the access token
                    FacebookAdsApi.init(META_CONFIG.accessToken);

                    // Create a Campaign object
                    const campaign = new Campaign(campaignId);

                    // Fetch detailed campaign information
                    const campaignInfo = await campaign.read([
                        'id',
                        'name',
                        'objective',
                        'status',
                        'daily_budget',
                        'lifetime_budget',
                        'buying_type',
                        'special_ad_categories',
                        'bid_strategy',
                        'created_time',
                        'start_time',
                        'stop_time',
                        'spend_cap',
                        'budget_remaining'
                    ]);

                    // Get associated ad sets (additional insights)
                    const adSets = await campaign.getAdSets({
                        limit: 5,
                        fields: ['id', 'name', 'status']
                    });

                    // Format ad sets
                    const formattedAdSets = adSets.map((adSet: any) => ({
                        id: adSet.id,
                        name: adSet.name,
                        status: adSet.status
                    }));

                    // Process and format the response
                    const formattedCampaignInfo = {
                        id: campaignInfo.id,
                        name: campaignInfo.name,
                        objective: campaignInfo.objective,
                        status: campaignInfo.status,
                        daily_budget: campaignInfo.daily_budget ? formatCurrency(campaignInfo.daily_budget, '') : null,
                        lifetime_budget: campaignInfo.lifetime_budget ? formatCurrency(campaignInfo.lifetime_budget, '') : null,
                        buying_type: campaignInfo.buying_type,
                        special_ad_categories: campaignInfo.special_ad_categories || [],
                        bid_strategy: campaignInfo.bid_strategy,
                        created_time: campaignInfo.created_time,
                        start_time: campaignInfo.start_time,
                        stop_time: campaignInfo.stop_time,
                        spend_cap: campaignInfo.spend_cap ? formatCurrency(campaignInfo.spend_cap, '') : "No limit",
                        budget_remaining: campaignInfo.budget_remaining ? formatCurrency(campaignInfo.budget_remaining, '') : null,
                        related_ad_sets: formattedAdSets,
                        related_ad_sets_count: formattedAdSets.length
                    };

                    return {
                        content: [{
                            type: "text",
                            text: JSON.stringify({
                                success: true,
                                campaign: formattedCampaignInfo
                            }, null, 2)
                        }]
                    };
                } catch (error) {
                    console.error("Meta Ads API Error:", error);
                    return {
                        content: [{
                            type: "text",
                            text: JSON.stringify({
                                success: false,
                                error: error instanceof Error ? error.message : String(error)
                            }, null, 2)
                        }]
                    };
                }
            }
        );

        // Tool: Get Ad Sets
        this.server.tool(
            "metaAdsGetAdSets",
            {
                accountId: z.string(),
                limit: z.number().default(10),
                campaignId: z.string().optional()
            },
            async ({ accountId, limit, campaignId }) => {
                try {
                    // Initialize the Facebook Ads API with the access token
                    FacebookAdsApi.init(META_CONFIG.accessToken);

                    // Create an AdAccount object
                    const account = new AdAccount(accountId);

                    // Prepare filtering if campaign ID is provided
                    let params: any = {
                        limit: limit,
                        fields: [
                            'id',
                            'name',
                            'status',
                            'campaign_id',
                            'daily_budget',
                            'lifetime_budget',
                            'targeting',
                            'optimization_goal',
                            'bid_amount',
                            'billing_event',
                            'start_time',
                            'end_time'
                        ]
                    };

                    if (campaignId) {
                        params.filtering = [
                            {
                                field: 'campaign.id',
                                operator: 'EQUAL',
                                value: campaignId
                            }
                        ];
                    }

                    // Fetch ad sets
                    const adSets = await account.getAdSets(params);

                    // Process and format the response
                    const formattedAdSets = adSets.map((adSet: any) => ({
                        id: adSet.id,
                        name: adSet.name,
                        status: adSet.status,
                        campaign_id: adSet.campaign_id,
                        daily_budget: adSet.daily_budget ? formatCurrency(adSet.daily_budget, '') : null,
                        lifetime_budget: adSet.lifetime_budget ? formatCurrency(adSet.lifetime_budget, '') : null,
                        optimization_goal: adSet.optimization_goal,
                        bid_amount: adSet.bid_amount ? formatCurrency(adSet.bid_amount, '') : null,
                        billing_event: adSet.billing_event,
                        targeting_summary: summarizeTargeting(adSet.targeting),
                        start_time: adSet.start_time,
                        end_time: adSet.end_time
                    }));

                    return {
                        content: [{
                            type: "text",
                            text: JSON.stringify({
                                success: true,
                                count: formattedAdSets.length,
                                ad_sets: formattedAdSets
                            }, null, 2)
                        }]
                    };
                } catch (error) {
                    console.error("Meta Ads API Error:", error);
                    return {
                        content: [{
                            type: "text",
                            text: JSON.stringify({
                                success: false,
                                error: error instanceof Error ? error.message : String(error)
                            }, null, 2)
                        }]
                    };
                }
            }
        );
    }
}

// Helper Functions

/**
 * Convert account status code to readable text
 */
function getAccountStatusText(statusCode: number): string {
    const statusMap: Record<number, string> = {
        1: "Active",
        2: "Disabled",
        3: "Unsettled",
        7: "Pending_risk_review",
        8: "Pending_settlement",
        9: "In_grace_period",
        100: "Pending_closure",
        101: "Closed",
        201: "Any_active",
        202: "Any_closed"
    };

    return statusMap[statusCode] || `Unknown (${statusCode})`;
}

/**
 * Format currency values
 */
function formatCurrency(amount: string | number, currency: string): string {
    if (!amount) return "0";

    // Convert from cents to whole units
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    const formattedAmount = (numAmount / 100).toFixed(2);

    if (currency) {
        return `${formattedAmount} ${currency}`;
    }

    return formattedAmount;
}

/**
 * Create a summary of targeting settings
 */
function summarizeTargeting(targeting: any): object {
    if (!targeting) return {};

    const summary: any = {};

    // Extract key targeting parameters
    if (targeting.age_min) summary.age_range = `${targeting.age_min}-${targeting.age_max || '65+'}`;
    if (targeting.genders && targeting.genders.length) {
        const genderMap: Record<number, string> = { 1: 'male', 2: 'female' };
        summary.genders = targeting.genders.map((g: number) => genderMap[g] || g);
    }

    // Geographic targeting
    if (targeting.geo_locations) {
        summary.locations = {};
        if (targeting.geo_locations.countries) summary.locations.countries = targeting.geo_locations.countries;
        if (targeting.geo_locations.cities) summary.locations.cities = targeting.geo_locations.cities.map((c: any) => c.name);
        if (targeting.geo_locations.regions) summary.locations.regions = targeting.geo_locations.regions.map((r: any) => r.name);
    }

    // Interests and behaviors
    if (targeting.interests) summary.interests = targeting.interests.map((i: any) => i.name || i.id);
    if (targeting.behaviors) summary.behaviors = targeting.behaviors.map((b: any) => b.name || b.id);

    return summary;
}

export default {
    fetch(request: Request, env: Env, ctx: ExecutionContext) {
        const url = new URL(request.url);

        if (url.pathname === "/sse" || url.pathname === "/sse/message") {
            // @ts-ignore
            return MyMCP.serveSSE("/sse").fetch(request, env, ctx);
        }

        if (url.pathname === "/mcp") {
            // @ts-ignore
            return MyMCP.serve("/mcp").fetch(request, env, ctx);
        }

        return new Response("Not found", { status: 404 });
    },
};

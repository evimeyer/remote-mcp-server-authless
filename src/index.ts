import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import axios from "axios";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

// Types for Apple Search Ads API
interface AppleSearchAdsResponse {
  data: any[];
  pagination?: {
    totalResults: number;
    startIndex: number;
    itemsPerPage: number;
  };
}

interface AppleSearchAdsAuth {
  clientId: string;
  teamId: string;
  keyId: string;
  privateKey: string;
}

interface ProcessedData {
  summary: {
    totalItems: number;
    itemsPerPage: number;
  };
  data: any[];
  analysis?: Record<string, any>;
}

interface Env {
  // Define environment variables if needed
}

// Define our MCP agent with tools
export class MyMCP extends McpAgent {
	server = new McpServer({
		name: "Authless Calculator & Apple Search Ads Tool",
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

        // Apple Search Ads Tool
        this.server.tool(
            "appleSearchAds",
            {
                endpoint: z.enum([
                    "campaigns", 
                    "adgroups", 
                    "keywords", 
                    "searchterms", 
                    "reports"
                ]),
                orgId: z.string(),
                limit: z.number().optional(),
                startDate: z.string().optional(),
                endDate: z.string().optional(),
                filters: z.record(z.unknown()).optional(),
                auth: z.object({
                    clientId: z.string(),
                    teamId: z.string(),
                    keyId: z.string(),
                    privateKey: z.string(),
                }),
            },
            async ({ 
                endpoint, 
                orgId, 
                limit = 100, 
                startDate, 
                endDate, 
                filters, 
                auth 
            }: { 
                endpoint: string; 
                orgId: string; 
                limit?: number; 
                startDate?: string; 
                endDate?: string; 
                filters?: Record<string, unknown>; 
                auth: AppleSearchAdsAuth;
            }) => {
                try {
                    // Generate JWT token for auth
                    const token = generateJWT(auth);
                    
                    // Build API URL based on endpoint
                    let apiUrl = `https://api.searchads.apple.com/api/v4/${endpoint}`;
                    
                    // Add query parameters
                    const params: Record<string, any> = {
                        limit,
                        orgId,
                    };
                    
                    if (startDate) params.startDate = startDate;
                    if (endDate) params.endDate = endDate;
                    
                    // Make request to Apple Search Ads API
                    const response = await axios.get<AppleSearchAdsResponse>(apiUrl, {
                        params,
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json',
                            'X-AP-Context': `orgId=${orgId}`
                        },
                        data: filters
                    });
                    
                    // Process and analyze data based on endpoint
                    const result = processSearchAdsData(response.data, endpoint);
                    
                    return { 
                        content: [{ 
                            type: "text", 
                            text: JSON.stringify(result, null, 2)
                        }] 
                    };
                } catch (error: unknown) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    console.error("Apple Search Ads API Error:", errorMessage);
                    return {
                        content: [{ 
                            type: "text", 
                            text: `Error fetching data from Apple Search Ads: ${errorMessage}`
                        }]
                    };
                }
            }
        );
	}
}

// Helper function to generate JWT for Apple Search Ads API
function generateJWT(auth: AppleSearchAdsAuth): string {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
        iss: auth.teamId,
        iat: now,
        exp: now + 3600, // Token valid for 1 hour
        aud: 'https://appleid.apple.com',
        sub: auth.clientId
    };

    const header = {
        alg: 'ES256',
        kid: auth.keyId,
        typ: 'JWT'
    };

    const headerBase64 = Buffer.from(JSON.stringify(header)).toString('base64url');
    const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto.createSign('sha256')
        .update(`${headerBase64}.${payloadBase64}`)
        .sign({ key: auth.privateKey, format: 'pem' }, 'base64url');

    return `${headerBase64}.${payloadBase64}.${signature}`;
}

// Helper function to process and analyze data based on endpoint
function processSearchAdsData(responseData: AppleSearchAdsResponse, endpoint: string): ProcessedData {
    const { data, pagination } = responseData;
    
    // Basic data processing
    const processed: ProcessedData = {
        summary: {
            totalItems: pagination?.totalResults || data.length,
            itemsPerPage: pagination?.itemsPerPage || data.length,
        },
        data,
        analysis: {}
    };
    
    // Add endpoint-specific analysis
    switch (endpoint) {
        case 'campaigns':
            processed.analysis = {
                activeCampaigns: data.filter((c: any) => c.status === 'ACTIVE').length,
                totalBudget: data.reduce((sum: number, c: any) => sum + (c.dailyBudget || 0), 0),
                campaignTypes: countByProperty(data, 'campaignType')
            };
            break;
        case 'keywords':
            processed.analysis = {
                keywordCount: data.length,
                bidStats: calculateStats(data.map((k: any) => k.bid)),
                matchTypes: countByProperty(data, 'matchType')
            };
            break;
        case 'searchterms':
            processed.analysis = {
                topSearchTerms: data.slice(0, 10).map((t: any) => ({
                    text: t.text,
                    impressions: t.impressions,
                    conversions: t.conversions
                })),
                performanceMetrics: calculateAverages(data)
            };
            break;
        case 'reports':
            processed.analysis = {
                totalImpressions: sum(data, 'impressions'),
                totalTaps: sum(data, 'taps'),
                totalInstalls: sum(data, 'installs'),
                conversionRate: average(data, 'conversionRate')
            };
            break;
    }
    
    return processed;
}

// Utility functions for data analysis
function countByProperty(items: any[], property: string): Record<string, number> {
    return items.reduce((counts: Record<string, number>, item: any) => {
        const value = item[property] || 'unknown';
        counts[value] = (counts[value] || 0) + 1;
        return counts;
    }, {});
}

function calculateStats(values: number[]): { min: number, max: number, avg: number } {
    const filtered = values.filter(v => typeof v === 'number');
    return {
        min: Math.min(...filtered),
        max: Math.max(...filtered),
        avg: filtered.reduce((sum, v) => sum + v, 0) / filtered.length
    };
}

function calculateAverages(items: any[]): Record<string, number> {
    const metrics = ['impressions', 'taps', 'conversions', 'conversionsValue'];
    const result: Record<string, number> = {};
    
    metrics.forEach(metric => {
        const avgName = `avg${metric.charAt(0).toUpperCase() + metric.slice(1)}`;
        result[avgName] = average(items, metric);
    });
    
    return result;
}

function sum(items: any[], property: string): number {
    return items.reduce((total: number, item: any) => total + (item[property] || 0), 0);
}

function average(items: any[], property: string): number {
    const total = sum(items, property);
    return items.length > 0 ? total / items.length : 0;
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

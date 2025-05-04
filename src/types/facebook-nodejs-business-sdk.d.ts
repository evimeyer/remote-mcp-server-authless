declare module 'facebook-nodejs-business-sdk' {
  export class FacebookAdsApi {
    static init(accessToken: string): void;
  }

  export class User {
    constructor(id: string);
    getAdAccounts(params?: any): Promise<any[]>;
  }

  export class AdAccount {
    constructor(id: string);
    read(fields: string[]): Promise<any>;
    getCampaigns(params?: any): Promise<any[]>;
    getAdSets(params?: any): Promise<any[]>;
  }

  export class Campaign {
    constructor(id: string);
    read(fields: string[]): Promise<any>;
    getAdSets(params?: any): Promise<any[]>;
  }

  export class AdSet {
    constructor(id: string);
    read(fields: string[]): Promise<any>;
  }

  export class Ad {
    constructor(id: string);
    read(fields: string[]): Promise<any>;
  }
}

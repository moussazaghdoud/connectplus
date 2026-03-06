/**
 * Seed script for Connector Marketplace definitions.
 *
 * Upserts 29 connector definitions across CRM, Helpdesk, and Enterprise categories:
 *   - zoho-crm (ACTIVE, CONFIG_DRIVEN)
 *   - hubspot  (ACTIVE, CODE_BASED)
 *   - 27 config-driven connectors (Salesforce, Dynamics, Zendesk, Freshdesk, etc.)
 *
 * Usage:
 *   npx tsx prisma/seed-marketplace.ts
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// ---------- helpers ----------

function makeSetupSteps(connectorSlug: string, vendor: {
  portalName: string;
  portalUrl: string;
  portalInstructions: string;
  credentialFields: { key: string; label: string; type: "text" | "secret" | "url"; required: boolean; placeholder?: string }[];
  regions?: { label: string; value: string }[];
  oauthButtonLabel?: string;
}) {
  const steps: Record<string, unknown>[] = [];

  if (vendor.regions) {
    steps.push({
      id: "region",
      title: "Choose Region",
      description: "Select your data center region",
      type: "select",
      field: "region",
      options: vendor.regions,
      default: vendor.regions[0]?.value,
    });
  }

  steps.push({
    id: "oauth-app",
    title: `Create ${vendor.portalName}`,
    description: vendor.portalInstructions,
    type: "instruction",
    content: vendor.portalInstructions,
    copyBlocks: [
      { label: "Redirect URI", template: `{{baseUrl}}/api/v1/auth/${connectorSlug}/callback` },
    ],
  });

  steps.push({
    id: "credentials",
    title: "Enter Credentials",
    description: `Paste your credentials from ${vendor.portalName}`,
    type: "credentials",
    fields: vendor.credentialFields,
  });

  steps.push({
    id: "authorize",
    title: "Authorize",
    description: "Connect your account via OAuth",
    type: "oauth",
    buttonLabel: vendor.oauthButtonLabel ?? `Connect ${connectorSlug}`,
  });

  steps.push({
    id: "test-search",
    title: "Test Contact Search",
    description: "Verify contact search works with your data",
    type: "test",
    testId: "contact_search",
  });

  steps.push({
    id: "activate",
    title: "Activate",
    description: "Enable the connector for all agents",
    type: "activate",
  });

  return steps;
}

// ---------- definitions ----------

const connectors = [
  // ──────────────── HUBSPOT (CODE_BASED, metadata row) ────────────────
  {
    slug: "hubspot",
    name: "HubSpot",
    shortDesc: "Screen-pop, contact search, and call logging with HubSpot CRM",
    description: "Code-based connector for HubSpot CRM with OAuth2, contact search, webhook events, and call engagement write-back.",
    category: "CRM" as const,
    tier: "CODE_BASED" as const,
    authType: "oauth2",
    status: "ACTIVE" as const,
    vendorUrl: "https://www.hubspot.com/",
    docsUrl: "https://developers.hubspot.com/docs/api/overview",
    iconName: "hubspot",
    prerequisites: [
      "HubSpot account with API access",
      "Admin access to create a private app or OAuth app in HubSpot Developer Portal",
      "Scopes: crm.objects.contacts.read, crm.objects.calls.write",
    ],
    setupSteps: makeSetupSteps("hubspot", {
      portalName: "HubSpot Developer App",
      portalUrl: "https://developers.hubspot.com/",
      portalInstructions: "1. Go to [HubSpot Developer Portal](https://developers.hubspot.com/)\n2. Create a new app under **Apps**\n3. Under **Auth**, add the redirect URI below\n4. Note your **Client ID** and **Client Secret**",
      credentialFields: [
        { key: "clientId", label: "Client ID", type: "text", required: true },
        { key: "clientSecret", label: "Client Secret", type: "secret", required: true },
      ],
      oauthButtonLabel: "Connect HubSpot",
    }),
    config: {}, // Code-based — config not used by RestCrmConnector
  },

  // ──────────────── ZOHO CRM (CONFIG_DRIVEN, existing) ────────────────
  {
    slug: "zoho-crm",
    name: "Zoho CRM",
    shortDesc: "Screen-pop, contact search, and call logging with Zoho CRM",
    description: "Config-driven connector for Zoho CRM with OAuth2, contact search via COQL/word search, and call write-back.",
    category: "CRM" as const,
    tier: "CONFIG_DRIVEN" as const,
    authType: "oauth2",
    status: "ACTIVE" as const,
    vendorUrl: "https://www.zoho.com/crm/",
    docsUrl: "https://www.zoho.com/crm/developer/docs/api/v2/",
    iconName: "zoho",
    prerequisites: [
      "Zoho CRM account with API access",
      "Admin access to create a Connected App (Self Client) in Zoho API Console",
      "Your Zoho region (EU, US, IN, AU, JP)",
    ],
    setupSteps: makeSetupSteps("zoho-crm", {
      portalName: "Zoho API Console App",
      portalUrl: "https://api-console.zoho.com/",
      portalInstructions: "1. Go to [Zoho API Console](https://api-console.zoho.com/)\n2. Click **Add Client** > **Server-based Applications**\n3. Set the **Authorized Redirect URI** to the value below",
      credentialFields: [
        { key: "clientId", label: "Client ID", type: "text", required: true },
        { key: "clientSecret", label: "Client Secret", type: "secret", required: true },
      ],
      regions: [
        { label: "Europe (EU)", value: "eu" },
        { label: "United States (US)", value: "com" },
        { label: "India (IN)", value: "in" },
        { label: "Australia (AU)", value: "com.au" },
        { label: "Japan (JP)", value: "co.jp" },
      ],
      oauthButtonLabel: "Connect Zoho CRM",
    }),
    // Config will be preserved if row exists; this is the fallback for fresh installs
    config: {
      apiBaseUrl: "https://www.zohoapis.com/crm/v2",
      auth: {
        type: "oauth2",
        oauth2: {
          authorizeUrl: "https://accounts.zoho.com/oauth/v2/auth",
          tokenUrl: "https://accounts.zoho.com/oauth/v2/token",
          scopes: [
            "ZohoCRM.modules.contacts.READ",
            "ZohoCRM.modules.leads.READ",
            "ZohoCRM.modules.accounts.READ",
            "ZohoCRM.modules.calls.CREATE",
          ],
          tokenPlacement: "header",
          tokenPrefix: "Zoho-oauthtoken",
          extraAuthParams: { access_type: "offline", prompt: "consent" },
        },
      },
      // Legacy single-endpoint (backward-compat, overridden by searchStrategies)
      contactSearch: {
        endpoint: "/Contacts/search",
        method: "GET",
        request: { queryParams: { word: "{{query}}" } },
        response: { resultsPath: "data", idField: "id" },
      },
      // Multi-module search: Contacts → Leads → Accounts (first match wins)
      searchStrategies: [
        {
          label: "Contacts",
          priority: 0,
          endpoint: "/Contacts/search",
          method: "GET",
          request: { queryParams: { word: "{{phone}}" } },
          response: { resultsPath: "data", idField: "id" },
          crmModule: "Contacts",
          fieldMapping: {
            displayName: "{{First_Name}} {{Last_Name}}",
            email: "Email",
            phone: "Phone || Mobile",
            company: "Company || Account_Name.name",
            title: "Title",
          },
        },
        {
          label: "Leads",
          priority: 1,
          endpoint: "/Leads/search",
          method: "GET",
          request: { queryParams: { word: "{{phone}}" } },
          response: { resultsPath: "data", idField: "id" },
          crmModule: "Leads",
          fieldMapping: {
            displayName: "{{First_Name}} {{Last_Name}}",
            email: "Email",
            phone: "Phone || Mobile",
            company: "Company",
            title: "Title",
          },
        },
        {
          label: "Accounts",
          priority: 2,
          endpoint: "/Accounts/search",
          method: "GET",
          request: { queryParams: { word: "{{phone}}" } },
          response: { resultsPath: "data", idField: "id" },
          crmModule: "Accounts",
          fieldMapping: {
            displayName: "Account_Name",
            phone: "Phone",
            company: "Account_Name",
          },
        },
      ],
      contactFieldMapping: {
        displayName: "{{First_Name}} {{Last_Name}}",
        email: "Email",
        phone: "Phone || Mobile",
        company: "Company",
        title: "Title",
      },
      crmLink: {
        urlTemplate: "https://crm.zoho.com/crm/tab/{{module}}/{{recordId}}",
      },
      writeBack: {
        endpoint: "/Calls",
        method: "POST",
        bodyTemplate: JSON.stringify({
          data: [{
            Subject: "Call via Rainbow",
            Call_Duration: "{{interaction.durationSecs}}",
            Call_Start_Time: "{{interaction.startedAt}}",
            Call_Type: "{{interaction.direction}}",
            Description: "Logged by ConnectPlus CTI",
          }],
        }),
      },
      healthCheck: { endpoint: "/settings/modules", method: "GET", expectedStatus: 200 },
    },
  },

  // ──────────────── SALESFORCE (PLANNED) ────────────────
  {
    slug: "salesforce",
    name: "Salesforce",
    shortDesc: "Connect Rainbow to Salesforce for screen-pop and call logging",
    description: "Config-driven connector for Salesforce CRM with OAuth2, SOSL contact search, and Task write-back.",
    category: "CRM" as const,
    tier: "CONFIG_DRIVEN" as const,
    authType: "oauth2",
    status: "DRAFT" as const,
    vendorUrl: "https://www.salesforce.com/",
    docsUrl: "https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/",
    iconName: "salesforce",
    prerequisites: [
      "Salesforce account with API access (Enterprise, Performance, Unlimited, or Developer edition)",
      "Admin access to create a Connected App in Salesforce Setup",
      "Your Salesforce instance URL (e.g. https://yourcompany.my.salesforce.com)",
    ],
    setupSteps: makeSetupSteps("salesforce", {
      portalName: "Salesforce Connected App",
      portalUrl: "https://login.salesforce.com/",
      portalInstructions: "1. Go to **Setup > App Manager > New Connected App**\n2. Enable **OAuth Settings**\n3. Add scopes: `api`, `refresh_token`\n4. Set **Callback URL** to the value below",
      credentialFields: [
        { key: "instanceUrl", label: "Instance URL", type: "url", required: true, placeholder: "https://yourcompany.my.salesforce.com" },
        { key: "clientId", label: "Consumer Key", type: "text", required: true },
        { key: "clientSecret", label: "Consumer Secret", type: "secret", required: true },
      ],
      oauthButtonLabel: "Connect Salesforce",
    }),
    config: {
      apiBaseUrl: "{{instanceUrl}}/services/data/v59.0",
      auth: {
        type: "oauth2",
        oauth2: {
          authorizeUrl: "https://login.salesforce.com/services/oauth2/authorize",
          tokenUrl: "https://login.salesforce.com/services/oauth2/token",
          scopes: ["api", "refresh_token"],
          tokenPlacement: "header",
          tokenPrefix: "Bearer",
        },
      },
      contactSearch: {
        endpoint: "/search",
        method: "GET",
        request: { queryParams: { q: "FIND {{{query}}} IN ALL FIELDS RETURNING Contact(Id, FirstName, LastName, Email, Phone, Account.Name, Title)" } },
        response: { resultsPath: "searchRecords", idField: "Id" },
      },
      contactFieldMapping: {
        displayName: "{{FirstName}} {{LastName}}",
        email: "Email",
        phone: "Phone",
        company: "Account.Name",
        title: "Title",
      },
      crmLink: {
        urlTemplate: "{{instanceUrl}}/{{recordId}}",
      },
      writeBack: {
        endpoint: "/sobjects/Task",
        method: "POST",
        bodyTemplate: JSON.stringify({
          Subject: "Call via Rainbow",
          Status: "Completed",
          Priority: "Normal",
          CallDurationInSeconds: "{{interaction.durationSecs}}",
          CallType: "{{interaction.direction}}",
          WhoId: "{{interaction.externalId}}",
        }),
      },
      healthCheck: { endpoint: "/limits", method: "GET", expectedStatus: 200 },
    },
  },

  // ──────────────── MICROSOFT DYNAMICS 365 (PLANNED) ────────────────
  {
    slug: "dynamics-365",
    name: "Microsoft Dynamics 365",
    shortDesc: "Connect Rainbow to Dynamics 365 for screen-pop and call logging",
    description: "Config-driven connector for Microsoft Dynamics 365 with OAuth2 (Azure AD), OData contact search, and phonecall entity write-back.",
    category: "CRM" as const,
    tier: "CONFIG_DRIVEN" as const,
    authType: "oauth2",
    status: "DRAFT" as const,
    vendorUrl: "https://dynamics.microsoft.com/",
    docsUrl: "https://learn.microsoft.com/en-us/dynamics365/customer-engagement/web-api/overview",
    iconName: "dynamics",
    prerequisites: [
      "Dynamics 365 Customer Engagement instance",
      "Azure AD app registration with Dynamics CRM API permissions",
      "Your org URL (e.g. https://yourorg.crm.dynamics.com)",
    ],
    setupSteps: makeSetupSteps("dynamics-365", {
      portalName: "Azure AD App Registration",
      portalUrl: "https://portal.azure.com/",
      portalInstructions: "1. Go to [Azure Portal > App registrations](https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps)\n2. Click **New registration**\n3. Add **Redirect URI** (Web) with the value below\n4. Under **API permissions**, add **Dynamics CRM > user_impersonation**\n5. Create a **Client Secret**",
      credentialFields: [
        { key: "orgUrl", label: "Organization URL", type: "url", required: true, placeholder: "https://yourorg.crm.dynamics.com" },
        { key: "clientId", label: "Application (client) ID", type: "text", required: true },
        { key: "clientSecret", label: "Client Secret", type: "secret", required: true },
        { key: "tenantId", label: "Directory (tenant) ID", type: "text", required: true },
      ],
      oauthButtonLabel: "Connect Dynamics 365",
    }),
    config: {
      apiBaseUrl: "{{orgUrl}}/api/data/v9.2",
      auth: {
        type: "oauth2",
        oauth2: {
          authorizeUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
          tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
          scopes: ["https://yourorg.crm.dynamics.com/.default"],
          tokenPlacement: "header",
          tokenPrefix: "Bearer",
        },
      },
      contactSearch: {
        endpoint: "/contacts",
        method: "GET",
        request: {
          queryParams: {
            "$filter": "contains(fullname,'{{query}}') or contains(emailaddress1,'{{query}}') or contains(telephone1,'{{query}}')",
            "$select": "contactid,fullname,emailaddress1,telephone1,company,jobtitle",
            "$top": "10",
          },
        },
        response: { resultsPath: "value", idField: "contactid" },
      },
      contactFieldMapping: {
        displayName: "fullname",
        email: "emailaddress1",
        phone: "telephone1",
        company: "company",
        title: "jobtitle",
      },
      healthCheck: { endpoint: "/WhoAmI", method: "GET", expectedStatus: 200 },
    },
  },

  // ──────────────── ZENDESK (PLANNED) ────────────────
  {
    slug: "zendesk",
    name: "Zendesk",
    shortDesc: "Connect Rainbow to Zendesk for ticket screen-pop and contact lookup",
    description: "Config-driven connector for Zendesk Support with API key or OAuth2, user search, and ticket creation write-back.",
    category: "HELPDESK" as const,
    tier: "CONFIG_DRIVEN" as const,
    authType: "api_key",
    status: "DRAFT" as const,
    vendorUrl: "https://www.zendesk.com/",
    docsUrl: "https://developer.zendesk.com/api-reference/",
    iconName: "zendesk",
    prerequisites: [
      "Zendesk Support account (Team plan or higher)",
      "Admin access to generate an API token",
      "Your Zendesk subdomain (e.g. yourcompany.zendesk.com)",
    ],
    setupSteps: [
      {
        id: "subdomain",
        title: "Enter Subdomain",
        description: "Provide your Zendesk subdomain",
        type: "credentials",
        fields: [
          { key: "subdomain", label: "Subdomain", type: "text", required: true, placeholder: "yourcompany" },
        ],
      },
      {
        id: "api-token",
        title: "Create API Token",
        description: "Generate an API token in Zendesk",
        type: "instruction",
        content: "1. Go to **Admin Center > Apps and integrations > APIs > Zendesk API**\n2. Click **Add API token**\n3. Copy the token (it won't be shown again)",
      },
      {
        id: "credentials",
        title: "Enter Credentials",
        type: "credentials",
        fields: [
          { key: "email", label: "Admin Email", type: "text", required: true },
          { key: "apiToken", label: "API Token", type: "secret", required: true },
        ],
      },
      {
        id: "test-search",
        title: "Test User Search",
        description: "Verify that user search works",
        type: "test",
        testId: "contact_search",
      },
      {
        id: "activate",
        title: "Activate",
        type: "activate",
      },
    ],
    config: {
      apiBaseUrl: "https://yourcompany.zendesk.com/api/v2",
      auth: {
        type: "api_key",
        apiKey: { headerName: "Authorization", prefix: "Basic" },
      },
      contactSearch: {
        endpoint: "/users/search.json",
        method: "GET",
        request: { queryParams: { query: "{{query}}" } },
        response: { resultsPath: "users", idField: "id" },
      },
      contactFieldMapping: {
        displayName: "name",
        email: "email",
        phone: "phone",
        company: "organization.name",
        title: "role",
      },
      healthCheck: { endpoint: "/users/me.json", method: "GET", expectedStatus: 200 },
    },
  },

  // ──────────────── FRESHDESK (PLANNED) ────────────────
  {
    slug: "freshdesk",
    name: "Freshdesk",
    shortDesc: "Connect Rainbow to Freshdesk for ticket screen-pop and contact lookup",
    description: "Config-driven connector for Freshdesk with API key auth, contact search, and ticket note write-back.",
    category: "HELPDESK" as const,
    tier: "CONFIG_DRIVEN" as const,
    authType: "api_key",
    status: "DRAFT" as const,
    vendorUrl: "https://www.freshdesk.com/",
    docsUrl: "https://developers.freshdesk.com/api/",
    iconName: "freshdesk",
    prerequisites: [
      "Freshdesk account (any plan with API access)",
      "Admin access to find your API key",
      "Your Freshdesk domain (e.g. yourcompany.freshdesk.com)",
    ],
    setupSteps: [
      {
        id: "domain",
        title: "Enter Domain",
        description: "Provide your Freshdesk domain",
        type: "credentials",
        fields: [
          { key: "domain", label: "Domain", type: "text", required: true, placeholder: "yourcompany.freshdesk.com" },
        ],
      },
      {
        id: "api-key",
        title: "Get API Key",
        description: "Find your API key in Freshdesk",
        type: "instruction",
        content: "1. Log in to Freshdesk\n2. Click your profile picture > **Profile Settings**\n3. Your API key is shown on the right side panel",
      },
      {
        id: "credentials",
        title: "Enter API Key",
        type: "credentials",
        fields: [
          { key: "apiKey", label: "API Key", type: "secret", required: true },
        ],
      },
      {
        id: "test-search",
        title: "Test Contact Search",
        type: "test",
        testId: "contact_search",
      },
      {
        id: "activate",
        title: "Activate",
        type: "activate",
      },
    ],
    config: {
      apiBaseUrl: "https://yourcompany.freshdesk.com/api/v2",
      auth: {
        type: "api_key",
        apiKey: { headerName: "Authorization", prefix: "Basic" },
      },
      contactSearch: {
        endpoint: "/contacts",
        method: "GET",
        request: { queryParams: { query: "\"{{query}}\"" } },
        response: { resultsPath: "$", idField: "id" },
      },
      contactFieldMapping: {
        displayName: "name",
        email: "email",
        phone: "phone || mobile",
        company: "company_name",
        title: "job_title",
      },
      healthCheck: { endpoint: "/agents/me", method: "GET", expectedStatus: 200 },
    },
  },

  // ──────────────── SERVICENOW (PLANNED) ────────────────
  {
    slug: "servicenow",
    name: "ServiceNow",
    shortDesc: "Connect Rainbow to ServiceNow for incident screen-pop and contact lookup",
    description: "Config-driven connector for ServiceNow with OAuth2 or Basic auth, Table API contact search, and incident creation.",
    category: "HELPDESK" as const,
    tier: "CONFIG_DRIVEN" as const,
    authType: "oauth2",
    status: "DRAFT" as const,
    vendorUrl: "https://www.servicenow.com/",
    docsUrl: "https://developer.servicenow.com/dev.do#!/reference/api/tokyo/rest/",
    iconName: "servicenow",
    prerequisites: [
      "ServiceNow instance (developer or enterprise)",
      "Admin access to create an OAuth Application Registry entry",
      "Your instance URL (e.g. https://yourinstance.service-now.com)",
    ],
    setupSteps: makeSetupSteps("servicenow", {
      portalName: "ServiceNow OAuth Application",
      portalUrl: "https://developer.servicenow.com/",
      portalInstructions: "1. Go to **System OAuth > Application Registry**\n2. Click **New** > **Create an OAuth API endpoint for external clients**\n3. Set the **Redirect URL** to the value below\n4. Note the **Client ID** and **Client Secret**",
      credentialFields: [
        { key: "instanceUrl", label: "Instance URL", type: "url", required: true, placeholder: "https://yourinstance.service-now.com" },
        { key: "clientId", label: "Client ID", type: "text", required: true },
        { key: "clientSecret", label: "Client Secret", type: "secret", required: true },
      ],
      oauthButtonLabel: "Connect ServiceNow",
    }),
    config: {
      apiBaseUrl: "https://yourinstance.service-now.com/api/now",
      auth: {
        type: "oauth2",
        oauth2: {
          authorizeUrl: "https://yourinstance.service-now.com/oauth_auth.do",
          tokenUrl: "https://yourinstance.service-now.com/oauth_token.do",
          scopes: ["useraccount"],
          tokenPlacement: "header",
          tokenPrefix: "Bearer",
        },
      },
      contactSearch: {
        endpoint: "/table/sys_user",
        method: "GET",
        request: {
          queryParams: {
            sysparm_query: "nameLIKE{{query}}^ORemailLIKE{{query}}^ORphoneLIKE{{query}}",
            sysparm_limit: "10",
            sysparm_fields: "sys_id,name,email,phone,company.name,title",
          },
        },
        response: { resultsPath: "result", idField: "sys_id" },
      },
      contactFieldMapping: {
        displayName: "name",
        email: "email",
        phone: "phone",
        company: "company.name",
        title: "title",
      },
      healthCheck: { endpoint: "/table/sys_user?sysparm_limit=1", method: "GET", expectedStatus: 200 },
    },
  },

  // ──────────────── PIPEDRIVE (PLANNED) ────────────────
  {
    slug: "pipedrive",
    name: "Pipedrive",
    shortDesc: "Connect Rainbow to Pipedrive for screen-pop and activity logging",
    description: "Config-driven connector for Pipedrive with OAuth2, person search, and activity write-back.",
    category: "CRM" as const,
    tier: "CONFIG_DRIVEN" as const,
    authType: "oauth2",
    status: "DRAFT" as const,
    vendorUrl: "https://www.pipedrive.com/",
    docsUrl: "https://developers.pipedrive.com/docs/api/v1",
    iconName: "pipedrive",
    prerequisites: [
      "Pipedrive account (any plan)",
      "Developer account to create an OAuth app in Pipedrive Marketplace",
      "Your Pipedrive company domain",
    ],
    setupSteps: makeSetupSteps("pipedrive", {
      portalName: "Pipedrive Developer App",
      portalUrl: "https://developers.pipedrive.com/",
      portalInstructions: "1. Go to [Pipedrive Developer Hub](https://developers.pipedrive.com/)\n2. Create a new app\n3. Under **OAuth & Access scopes**, add the redirect URI below\n4. Select scopes: `contacts:read`, `activities:write`",
      credentialFields: [
        { key: "clientId", label: "Client ID", type: "text", required: true },
        { key: "clientSecret", label: "Client Secret", type: "secret", required: true },
      ],
      oauthButtonLabel: "Connect Pipedrive",
    }),
    config: {
      apiBaseUrl: "https://api.pipedrive.com/v1",
      auth: {
        type: "oauth2",
        oauth2: {
          authorizeUrl: "https://oauth.pipedrive.com/oauth/authorize",
          tokenUrl: "https://oauth.pipedrive.com/oauth/token",
          scopes: ["contacts:read", "activities:write"],
          tokenPlacement: "header",
          tokenPrefix: "Bearer",
        },
      },
      contactSearch: {
        endpoint: "/persons/search",
        method: "GET",
        request: { queryParams: { term: "{{query}}", limit: "10" } },
        response: { resultsPath: "data.items", idField: "item.id" },
      },
      contactFieldMapping: {
        displayName: "item.name",
        email: "item.primary_email",
        phone: "item.primary_phone",
        company: "item.organization.name",
        title: "item.job_title",
      },
      healthCheck: { endpoint: "/users/me", method: "GET", expectedStatus: 200 },
    },
  },

  // ──────────────── INTERCOM (PLANNED) ────────────────
  {
    slug: "intercom",
    name: "Intercom",
    shortDesc: "Connect Rainbow to Intercom for contact lookup and conversation context",
    description: "Config-driven connector for Intercom with OAuth2, contact search, and note write-back.",
    category: "HELPDESK" as const,
    tier: "CONFIG_DRIVEN" as const,
    authType: "oauth2",
    status: "DRAFT" as const,
    vendorUrl: "https://www.intercom.com/",
    docsUrl: "https://developers.intercom.com/docs/references/rest-api/api.intercom.io/",
    iconName: "intercom",
    prerequisites: [
      "Intercom account (any plan with API access)",
      "Developer Hub access to create an OAuth app",
    ],
    setupSteps: makeSetupSteps("intercom", {
      portalName: "Intercom Developer App",
      portalUrl: "https://developers.intercom.com/",
      portalInstructions: "1. Go to [Intercom Developer Hub](https://app.intercom.com/a/apps/_/developer-hub)\n2. Create a new app\n3. Under **Authentication**, set the redirect URI below\n4. Note your **Client ID** and **Client Secret**",
      credentialFields: [
        { key: "clientId", label: "Client ID", type: "text", required: true },
        { key: "clientSecret", label: "Client Secret", type: "secret", required: true },
      ],
      oauthButtonLabel: "Connect Intercom",
    }),
    config: {
      apiBaseUrl: "https://api.intercom.io",
      auth: {
        type: "oauth2",
        oauth2: {
          authorizeUrl: "https://app.intercom.com/oauth",
          tokenUrl: "https://api.intercom.io/auth/eagle/token",
          scopes: [],
          tokenPlacement: "header",
          tokenPrefix: "Bearer",
        },
      },
      contactSearch: {
        endpoint: "/contacts/search",
        method: "POST",
        request: {
          bodyTemplate: JSON.stringify({
            query: {
              operator: "OR",
              value: [
                { field: "name", operator: "~", value: "{{query}}" },
                { field: "email", operator: "~", value: "{{query}}" },
                { field: "phone", operator: "~", value: "{{query}}" },
              ],
            },
          }),
        },
        response: { resultsPath: "data", idField: "id" },
      },
      contactFieldMapping: {
        displayName: "name",
        email: "email",
        phone: "phone",
        company: "companies.data.0.name",
        title: "custom_attributes.job_title",
      },
      healthCheck: { endpoint: "/me", method: "GET", expectedStatus: 200 },
    },
  },

  // ══════════════════════════════════════════════════════════════════════
  //  NEW BATCH — 20 Additional Connectors
  // ══════════════════════════════════════════════════════════════════════

  // ──────────────── MONDAY.COM CRM ────────────────
  {
    slug: "monday-crm",
    name: "Monday.com CRM",
    shortDesc: "Screen-pop and contact lookup with Monday.com CRM",
    description: "Config-driven connector for Monday.com CRM with OAuth2, items search via GraphQL-over-REST, and activity write-back.",
    category: "CRM" as const,
    tier: "CONFIG_DRIVEN" as const,
    authType: "oauth2",
    status: "DRAFT" as const,
    vendorUrl: "https://monday.com/",
    docsUrl: "https://developer.monday.com/api-reference/reference",
    iconName: "monday",
    prerequisites: [
      "Monday.com account with CRM product enabled",
      "Admin access to create an app in Monday Apps Marketplace",
      "OAuth scopes: boards:read, account:read",
    ],
    setupSteps: makeSetupSteps("monday-crm", {
      portalName: "Monday.com Developer App",
      portalUrl: "https://auth.monday.com/",
      portalInstructions: "1. Go to [Monday.com Developers](https://monday.com/developers/apps)\n2. Create a new app\n3. Under **OAuth**, add the redirect URI below\n4. Select scopes: `boards:read`, `account:read`",
      credentialFields: [
        { key: "clientId", label: "Client ID", type: "text", required: true },
        { key: "clientSecret", label: "Client Secret", type: "secret", required: true },
      ],
      oauthButtonLabel: "Connect Monday.com",
    }),
    config: {
      apiBaseUrl: "https://api.monday.com/v2",
      auth: {
        type: "oauth2",
        oauth2: {
          authorizeUrl: "https://auth.monday.com/oauth2/authorize",
          tokenUrl: "https://auth.monday.com/oauth2/token",
          scopes: ["boards:read", "account:read"],
          tokenPlacement: "header",
          tokenPrefix: "Bearer",
        },
      },
      contactSearch: {
        endpoint: "",
        method: "POST",
        request: {
          bodyTemplate: JSON.stringify({
            query: `{ items_page_by_column_values (limit: 5, board_id: 0, columns: [{column_id: "phone", column_values: ["{{query}}"]}]) { items { id name column_values { id text } } } }`,
          }),
        },
        response: { resultsPath: "data.items_page_by_column_values.items", idField: "id" },
      },
      contactFieldMapping: {
        displayName: "name",
        phone: "column_values.0.text",
        email: "column_values.1.text",
      },
      healthCheck: { endpoint: "", method: "POST", expectedStatus: 200 },
    },
  },

  // ──────────────── COPPER CRM ────────────────
  {
    slug: "copper",
    name: "Copper",
    shortDesc: "Screen-pop and contact lookup with Copper CRM",
    description: "Config-driven connector for Copper (Google Workspace CRM) with API key auth, people search, and activity logging.",
    category: "CRM" as const,
    tier: "CONFIG_DRIVEN" as const,
    authType: "api_key",
    status: "DRAFT" as const,
    vendorUrl: "https://www.copper.com/",
    docsUrl: "https://developer.copper.com/",
    iconName: "copper",
    prerequisites: [
      "Copper account (any plan with API access)",
      "Admin access to generate an API key",
      "Your Copper account email address",
    ],
    setupSteps: [
      {
        id: "api-key",
        title: "Get API Key",
        description: "Generate your Copper API key",
        type: "instruction",
        content: "1. Log in to Copper\n2. Go to **Settings > Integrations > API Keys**\n3. Click **Generate API Key**\n4. Copy the key",
      },
      {
        id: "credentials",
        title: "Enter Credentials",
        type: "credentials",
        fields: [
          { key: "email", label: "Account Email", type: "text", required: true, placeholder: "admin@yourcompany.com" },
          { key: "apiKey", label: "API Key", type: "secret", required: true },
        ],
      },
      { id: "test-search", title: "Test Contact Search", type: "test", testId: "contact_search" },
      { id: "activate", title: "Activate", type: "activate" },
    ],
    config: {
      apiBaseUrl: "https://api.copper.com/developer_api/v1",
      auth: {
        type: "api_key",
        apiKey: { headerName: "X-PW-AccessToken", prefix: "" },
      },
      contactSearch: {
        endpoint: "/people/search",
        method: "POST",
        request: {
          bodyTemplate: JSON.stringify({
            phone_number: "{{phone}}",
            page_size: 5,
          }),
        },
        response: { resultsPath: "$", idField: "id" },
      },
      contactFieldMapping: {
        displayName: "name",
        email: "emails.0.email",
        phone: "phone_numbers.0.number",
        company: "company_name",
        title: "title",
      },
      crmLink: {
        urlTemplate: "https://app.copper.com/companies/{{orgId}}/app#/people/{{recordId}}",
      },
      healthCheck: { endpoint: "/account", method: "GET", expectedStatus: 200 },
    },
  },

  // ──────────────── FRESHSALES ────────────────
  {
    slug: "freshsales",
    name: "Freshsales",
    shortDesc: "Screen-pop and contact lookup with Freshsales CRM",
    description: "Config-driven connector for Freshsales (Freshworks CRM) with API key auth, contact/lead search, and note logging.",
    category: "CRM" as const,
    tier: "CONFIG_DRIVEN" as const,
    authType: "api_key",
    status: "DRAFT" as const,
    vendorUrl: "https://www.freshworks.com/crm/sales/",
    docsUrl: "https://developers.freshworks.com/crm/api/",
    iconName: "freshsales",
    prerequisites: [
      "Freshsales account (Growth plan or higher)",
      "Admin access to find your API key",
      "Your Freshsales domain (e.g. yourcompany.myfreshworks.com)",
    ],
    setupSteps: [
      {
        id: "domain",
        title: "Enter Domain",
        type: "credentials",
        fields: [
          { key: "domain", label: "Freshsales Domain", type: "text", required: true, placeholder: "yourcompany.myfreshworks.com" },
        ],
      },
      {
        id: "api-key",
        title: "Get API Key",
        type: "instruction",
        content: "1. Log in to Freshsales\n2. Click your profile icon → **Settings**\n3. Go to **API Settings**\n4. Copy your API key",
      },
      {
        id: "credentials",
        title: "Enter API Key",
        type: "credentials",
        fields: [
          { key: "apiKey", label: "API Key", type: "secret", required: true },
        ],
      },
      { id: "test-search", title: "Test Contact Search", type: "test", testId: "contact_search" },
      { id: "activate", title: "Activate", type: "activate" },
    ],
    config: {
      apiBaseUrl: "https://yourcompany.myfreshworks.com/crm/sales/api",
      auth: {
        type: "api_key",
        apiKey: { headerName: "Authorization", prefix: "Token token=" },
      },
      contactSearch: {
        endpoint: "/search",
        method: "GET",
        request: { queryParams: { q: "{{query}}", include: "contact" } },
        response: { resultsPath: "$", idField: "id" },
      },
      contactFieldMapping: {
        displayName: "display_name",
        email: "email",
        phone: "work_number || mobile_number",
        company: "company.name",
        title: "job_title",
      },
      crmLink: {
        urlTemplate: "https://yourcompany.myfreshworks.com/crm/sales/contacts/{{recordId}}",
      },
      healthCheck: { endpoint: "/contacts/filters", method: "GET", expectedStatus: 200 },
    },
  },

  // ──────────────── CLOSE CRM ────────────────
  {
    slug: "close",
    name: "Close",
    shortDesc: "Screen-pop and contact lookup with Close CRM",
    description: "Config-driven connector for Close CRM with API key auth, lead/contact search, and call activity logging.",
    category: "CRM" as const,
    tier: "CONFIG_DRIVEN" as const,
    authType: "api_key",
    status: "DRAFT" as const,
    vendorUrl: "https://www.close.com/",
    docsUrl: "https://developer.close.com/",
    iconName: "close",
    prerequisites: [
      "Close account (any plan with API access)",
      "Admin access to generate an API key",
    ],
    setupSteps: [
      {
        id: "api-key",
        title: "Get API Key",
        type: "instruction",
        content: "1. Log in to Close\n2. Go to **Settings > Developer > API Keys**\n3. Click **Create API Key**\n4. Copy the key",
      },
      {
        id: "credentials",
        title: "Enter API Key",
        type: "credentials",
        fields: [
          { key: "apiKey", label: "API Key", type: "secret", required: true },
        ],
      },
      { id: "test-search", title: "Test Contact Search", type: "test", testId: "contact_search" },
      { id: "activate", title: "Activate", type: "activate" },
    ],
    config: {
      apiBaseUrl: "https://api.close.com/api/v1",
      auth: {
        type: "api_key",
        apiKey: { headerName: "Authorization", prefix: "Basic " },
      },
      contactSearch: {
        endpoint: "/contact",
        method: "GET",
        request: { queryParams: { query: "phone:\"{{phone}}\"", _limit: "5" } },
        response: { resultsPath: "data", idField: "id" },
      },
      contactFieldMapping: {
        displayName: "name",
        email: "emails.0.email",
        phone: "phones.0.phone",
        company: "lead_name",
        title: "title",
      },
      writeBack: {
        endpoint: "/activity/call",
        method: "POST",
        bodyTemplate: JSON.stringify({
          direction: "{{interaction.direction}}",
          duration: "{{interaction.durationSecs}}",
          phone: "{{interaction.metadata.fromNumber}}",
          note: "Call via Rainbow CTI",
          status: "completed",
        }),
      },
      crmLink: {
        urlTemplate: "https://app.close.com/contact/{{recordId}}/",
      },
      healthCheck: { endpoint: "/me", method: "GET", expectedStatus: 200 },
    },
  },

  // ──────────────── SUGARCRM ────────────────
  {
    slug: "sugarcrm",
    name: "SugarCRM",
    shortDesc: "Screen-pop and contact lookup with SugarCRM",
    description: "Config-driven connector for SugarCRM with OAuth2, contact/lead search, and call activity logging.",
    category: "CRM" as const,
    tier: "CONFIG_DRIVEN" as const,
    authType: "oauth2",
    status: "DRAFT" as const,
    vendorUrl: "https://www.sugarcrm.com/",
    docsUrl: "https://support.sugarcrm.com/Documentation/Sugar_Developer/Sugar_Developer_Guide/Integration/Web_Services/REST_API/",
    iconName: "sugarcrm",
    prerequisites: [
      "SugarCRM instance (Professional or higher)",
      "Admin access to create an OAuth2 key in Admin > OAuth Keys",
      "Your SugarCRM instance URL",
    ],
    setupSteps: makeSetupSteps("sugarcrm", {
      portalName: "SugarCRM OAuth Key",
      portalUrl: "https://support.sugarcrm.com/",
      portalInstructions: "1. Log in to SugarCRM as admin\n2. Go to **Admin > OAuth Keys**\n3. Click **Create** and enter a name\n4. Set the **Redirect URL** to the value below\n5. Note the **Consumer Key** and **Consumer Secret**",
      credentialFields: [
        { key: "instanceUrl", label: "Instance URL", type: "url", required: true, placeholder: "https://yourcompany.sugarondemand.com" },
        { key: "clientId", label: "Consumer Key", type: "text", required: true },
        { key: "clientSecret", label: "Consumer Secret", type: "secret", required: true },
      ],
      oauthButtonLabel: "Connect SugarCRM",
    }),
    config: {
      apiBaseUrl: "https://yourcompany.sugarondemand.com/rest/v11_15",
      auth: {
        type: "oauth2",
        oauth2: {
          authorizeUrl: "https://yourcompany.sugarondemand.com/rest/v11_15/oauth2/authorize",
          tokenUrl: "https://yourcompany.sugarondemand.com/rest/v11_15/oauth2/token",
          scopes: [],
          tokenPlacement: "header",
          tokenPrefix: "Bearer",
        },
      },
      contactSearch: {
        endpoint: "/Contacts/filter",
        method: "POST",
        request: {
          bodyTemplate: JSON.stringify({
            filter: [{ "$or": [{ phone_work: { "$contains": "{{phone}}" } }, { phone_mobile: { "$contains": "{{phone}}" } }] }],
            fields: "id,first_name,last_name,email,phone_work,phone_mobile,account_name,title",
            max_num: 5,
          }),
        },
        response: { resultsPath: "records", idField: "id" },
      },
      contactFieldMapping: {
        displayName: "{{first_name}} {{last_name}}",
        email: "email.0.email_address",
        phone: "phone_work || phone_mobile",
        company: "account_name",
        title: "title",
      },
      crmLink: {
        urlTemplate: "https://yourcompany.sugarondemand.com/#Contacts/{{recordId}}",
      },
      healthCheck: { endpoint: "/me", method: "GET", expectedStatus: 200 },
    },
  },

  // ──────────────── INSIGHTLY ────────────────
  {
    slug: "insightly",
    name: "Insightly",
    shortDesc: "Screen-pop and contact lookup with Insightly CRM",
    description: "Config-driven connector for Insightly CRM with API key auth, contact search, and event logging.",
    category: "CRM" as const,
    tier: "CONFIG_DRIVEN" as const,
    authType: "api_key",
    status: "DRAFT" as const,
    vendorUrl: "https://www.insightly.com/",
    docsUrl: "https://api.insightly.com/v3.1/Help",
    iconName: "insightly",
    prerequisites: [
      "Insightly account (Plus plan or higher for API access)",
      "Admin access to find your API key",
    ],
    setupSteps: [
      {
        id: "api-key",
        title: "Get API Key",
        type: "instruction",
        content: "1. Log in to Insightly\n2. Click your avatar → **User Settings**\n3. Scroll to **API Key** section\n4. Copy the API key",
      },
      {
        id: "credentials",
        title: "Enter API Key",
        type: "credentials",
        fields: [
          { key: "apiKey", label: "API Key", type: "secret", required: true },
        ],
      },
      { id: "test-search", title: "Test Contact Search", type: "test", testId: "contact_search" },
      { id: "activate", title: "Activate", type: "activate" },
    ],
    config: {
      apiBaseUrl: "https://api.insightly.com/v3.1",
      auth: {
        type: "api_key",
        apiKey: { headerName: "Authorization", prefix: "Basic " },
      },
      contactSearch: {
        endpoint: "/Contacts/Search",
        method: "GET",
        request: { queryParams: { phone: "{{phone}}", top: "5" } },
        response: { resultsPath: "$", idField: "CONTACT_ID" },
      },
      contactFieldMapping: {
        displayName: "{{FIRST_NAME}} {{LAST_NAME}}",
        email: "EMAIL_ADDRESS",
        phone: "PHONE || PHONE_MOBILE",
        company: "ORGANISATION_NAME",
        title: "TITLE",
      },
      crmLink: {
        urlTemplate: "https://crm.insightly.com/contacts/details/{{recordId}}",
      },
      healthCheck: { endpoint: "/Instance", method: "GET", expectedStatus: 200 },
    },
  },

  // ──────────────── NUTSHELL ────────────────
  {
    slug: "nutshell",
    name: "Nutshell",
    shortDesc: "Screen-pop and contact lookup with Nutshell CRM",
    description: "Config-driven connector for Nutshell CRM with API key auth, contact search, and activity logging.",
    category: "CRM" as const,
    tier: "CONFIG_DRIVEN" as const,
    authType: "api_key",
    status: "DRAFT" as const,
    vendorUrl: "https://www.nutshell.com/",
    docsUrl: "https://developers.nutshell.com/",
    iconName: "nutshell",
    prerequisites: [
      "Nutshell account (any plan)",
      "API key from Nutshell settings",
    ],
    setupSteps: [
      {
        id: "api-key",
        title: "Get API Key",
        type: "instruction",
        content: "1. Log in to Nutshell\n2. Go to **Setup > API Keys**\n3. Click **New API Key**\n4. Copy the key and your email",
      },
      {
        id: "credentials",
        title: "Enter Credentials",
        type: "credentials",
        fields: [
          { key: "email", label: "Account Email", type: "text", required: true },
          { key: "apiKey", label: "API Key", type: "secret", required: true },
        ],
      },
      { id: "test-search", title: "Test Contact Search", type: "test", testId: "contact_search" },
      { id: "activate", title: "Activate", type: "activate" },
    ],
    config: {
      apiBaseUrl: "https://app.nutshell.com/api/v1/json",
      auth: {
        type: "api_key",
        apiKey: { headerName: "Authorization", prefix: "Basic " },
      },
      contactSearch: {
        endpoint: "",
        method: "POST",
        request: {
          bodyTemplate: JSON.stringify({
            method: "searchContacts",
            params: { query: "{{phone}}" },
          }),
        },
        response: { resultsPath: "result", idField: "id" },
      },
      contactFieldMapping: {
        displayName: "name",
        email: "email.0",
        phone: "phone.0",
        company: "accounts.0.name",
      },
      healthCheck: { endpoint: "", method: "POST", expectedStatus: 200 },
    },
  },

  // ──────────────── CAPSULE CRM ────────────────
  {
    slug: "capsule",
    name: "Capsule CRM",
    shortDesc: "Screen-pop and contact lookup with Capsule CRM",
    description: "Config-driven connector for Capsule CRM with OAuth2, party search, and task/note logging.",
    category: "CRM" as const,
    tier: "CONFIG_DRIVEN" as const,
    authType: "oauth2",
    status: "DRAFT" as const,
    vendorUrl: "https://capsulecrm.com/",
    docsUrl: "https://developer.capsulecrm.com/v2/",
    iconName: "capsule",
    prerequisites: [
      "Capsule CRM account (Professional plan for API access)",
      "Admin access to register an application",
    ],
    setupSteps: makeSetupSteps("capsule", {
      portalName: "Capsule Registered App",
      portalUrl: "https://capsulecrm.com/",
      portalInstructions: "1. Go to [Capsule Developer](https://developer.capsulecrm.com/)\n2. Register a new application\n3. Set the **Redirect URI** to the value below\n4. Note the **Client ID** and **Client Secret**",
      credentialFields: [
        { key: "clientId", label: "Client ID", type: "text", required: true },
        { key: "clientSecret", label: "Client Secret", type: "secret", required: true },
      ],
      oauthButtonLabel: "Connect Capsule",
    }),
    config: {
      apiBaseUrl: "https://api.capsulecrm.com/api/v2",
      auth: {
        type: "oauth2",
        oauth2: {
          authorizeUrl: "https://api.capsulecrm.com/oauth/authorise",
          tokenUrl: "https://api.capsulecrm.com/oauth/token",
          scopes: [],
          tokenPlacement: "header",
          tokenPrefix: "Bearer",
        },
      },
      contactSearch: {
        endpoint: "/parties/search",
        method: "GET",
        request: { queryParams: { q: "{{query}}", perPage: "5" } },
        response: { resultsPath: "parties", idField: "id" },
      },
      contactFieldMapping: {
        displayName: "{{firstName}} {{lastName}}",
        email: "emailAddresses.0.address",
        phone: "phoneNumbers.0.number",
        company: "organisation.name",
        title: "jobTitle",
      },
      crmLink: {
        urlTemplate: "https://{{subdomain}}.capsulecrm.com/party/{{recordId}}",
      },
      healthCheck: { endpoint: "/users", method: "GET", expectedStatus: 200 },
    },
  },

  // ──────────────── KEAP (INFUSIONSOFT) ────────────────
  {
    slug: "keap",
    name: "Keap",
    shortDesc: "Screen-pop and contact lookup with Keap CRM",
    description: "Config-driven connector for Keap (formerly Infusionsoft) with OAuth2, contact search, and note logging.",
    category: "CRM" as const,
    tier: "CONFIG_DRIVEN" as const,
    authType: "oauth2",
    status: "DRAFT" as const,
    vendorUrl: "https://keap.com/",
    docsUrl: "https://developer.keap.com/docs/restv2/",
    iconName: "keap",
    prerequisites: [
      "Keap account (Pro plan or higher for API access)",
      "Developer account at developer.keap.com",
    ],
    setupSteps: makeSetupSteps("keap", {
      portalName: "Keap Developer App",
      portalUrl: "https://developer.keap.com/",
      portalInstructions: "1. Go to [Keap Developer Portal](https://developer.keap.com/)\n2. Create a new API key/app\n3. Set the **Redirect URI** to the value below\n4. Note your **Client ID** and **Client Secret**",
      credentialFields: [
        { key: "clientId", label: "Client ID", type: "text", required: true },
        { key: "clientSecret", label: "Client Secret", type: "secret", required: true },
      ],
      oauthButtonLabel: "Connect Keap",
    }),
    config: {
      apiBaseUrl: "https://api.infusionsoft.com/crm/rest/v2",
      auth: {
        type: "oauth2",
        oauth2: {
          authorizeUrl: "https://accounts.infusionsoft.com/app/oauth/authorize",
          tokenUrl: "https://api.infusionsoft.com/token",
          scopes: [],
          tokenPlacement: "header",
          tokenPrefix: "Bearer",
        },
      },
      contactSearch: {
        endpoint: "/contacts",
        method: "GET",
        request: { queryParams: { filter: "phone_number=={{phone}}", limit: "5" } },
        response: { resultsPath: "contacts", idField: "id" },
      },
      contactFieldMapping: {
        displayName: "{{given_name}} {{family_name}}",
        email: "email_addresses.0.email",
        phone: "phone_numbers.0.number",
        company: "company.company_name",
        title: "job_title",
      },
      crmLink: {
        urlTemplate: "https://app.keap.com/contact/{{recordId}}",
      },
      healthCheck: { endpoint: "/account/profile", method: "GET", expectedStatus: 200 },
    },
  },

  // ──────────────── BITRIX24 ────────────────
  {
    slug: "bitrix24",
    name: "Bitrix24",
    shortDesc: "Screen-pop and contact lookup with Bitrix24 CRM",
    description: "Config-driven connector for Bitrix24 with OAuth2, CRM contact/lead search, and activity logging.",
    category: "CRM" as const,
    tier: "CONFIG_DRIVEN" as const,
    authType: "oauth2",
    status: "DRAFT" as const,
    vendorUrl: "https://www.bitrix24.com/",
    docsUrl: "https://training.bitrix24.com/rest_help/",
    iconName: "bitrix24",
    prerequisites: [
      "Bitrix24 account (any plan with REST API)",
      "Admin access to register a local app",
      "Your Bitrix24 portal URL (e.g. yourcompany.bitrix24.com)",
    ],
    setupSteps: makeSetupSteps("bitrix24", {
      portalName: "Bitrix24 Local App",
      portalUrl: "https://www.bitrix24.com/",
      portalInstructions: "1. Go to **Developer resources** in your Bitrix24 portal\n2. Click **Other > Local application**\n3. Set the **Redirect URI** to the value below\n4. Select permissions: `crm`, `telephony`\n5. Note the **client_id** and **client_secret**",
      credentialFields: [
        { key: "portalUrl", label: "Portal URL", type: "url", required: true, placeholder: "https://yourcompany.bitrix24.com" },
        { key: "clientId", label: "client_id", type: "text", required: true },
        { key: "clientSecret", label: "client_secret", type: "secret", required: true },
      ],
      oauthButtonLabel: "Connect Bitrix24",
    }),
    config: {
      apiBaseUrl: "https://yourcompany.bitrix24.com/rest",
      auth: {
        type: "oauth2",
        oauth2: {
          authorizeUrl: "https://yourcompany.bitrix24.com/oauth/authorize/",
          tokenUrl: "https://oauth.bitrix.info/oauth/token/",
          scopes: ["crm", "telephony"],
          tokenPlacement: "query",
          tokenPrefix: "",
        },
      },
      contactSearch: {
        endpoint: "/crm.contact.list",
        method: "GET",
        request: {
          queryParams: {
            "filter[PHONE]": "{{phone}}",
            "select[]": "ID,NAME,LAST_NAME,EMAIL,PHONE,COMPANY_TITLE,POST",
          },
        },
        response: { resultsPath: "result", idField: "ID" },
      },
      contactFieldMapping: {
        displayName: "{{NAME}} {{LAST_NAME}}",
        email: "EMAIL.0.VALUE",
        phone: "PHONE.0.VALUE",
        company: "COMPANY_TITLE",
        title: "POST",
      },
      crmLink: {
        urlTemplate: "https://yourcompany.bitrix24.com/crm/contact/details/{{recordId}}/",
      },
      healthCheck: { endpoint: "/profile", method: "GET", expectedStatus: 200 },
    },
  },

  // ──────────────── ZOHO DESK ────────────────
  {
    slug: "zoho-desk",
    name: "Zoho Desk",
    shortDesc: "Screen-pop and ticket lookup with Zoho Desk",
    description: "Config-driven connector for Zoho Desk with OAuth2, contact/ticket search, and ticket comment write-back.",
    category: "HELPDESK" as const,
    tier: "CONFIG_DRIVEN" as const,
    authType: "oauth2",
    status: "DRAFT" as const,
    vendorUrl: "https://www.zoho.com/desk/",
    docsUrl: "https://desk.zoho.com/DeskAPIDocument",
    iconName: "zoho-desk",
    prerequisites: [
      "Zoho Desk account with API access",
      "Admin access to Zoho API Console",
      "Your Zoho Desk org ID",
    ],
    setupSteps: makeSetupSteps("zoho-desk", {
      portalName: "Zoho API Console App",
      portalUrl: "https://api-console.zoho.com/",
      portalInstructions: "1. Go to [Zoho API Console](https://api-console.zoho.com/)\n2. Use your existing ConnectPlus app or create a new one\n3. Add the **Redirect URI** below\n4. Note the **Client ID** and **Client Secret**",
      credentialFields: [
        { key: "clientId", label: "Client ID", type: "text", required: true },
        { key: "clientSecret", label: "Client Secret", type: "secret", required: true },
        { key: "orgId", label: "Org ID", type: "text", required: true, placeholder: "Your Zoho Desk Org ID" },
      ],
      oauthButtonLabel: "Connect Zoho Desk",
    }),
    config: {
      apiBaseUrl: "https://desk.zoho.com/api/v1",
      auth: {
        type: "oauth2",
        oauth2: {
          authorizeUrl: "https://accounts.zoho.com/oauth/v2/auth",
          tokenUrl: "https://accounts.zoho.com/oauth/v2/token",
          scopes: ["Desk.contacts.READ", "Desk.tickets.READ", "Desk.tickets.WRITE"],
          tokenPlacement: "header",
          tokenPrefix: "Zoho-oauthtoken",
          extraAuthParams: { access_type: "offline", prompt: "consent" },
        },
      },
      contactSearch: {
        endpoint: "/contacts/search",
        method: "GET",
        request: { queryParams: { searchStr: "{{phone}}", limit: "5" } },
        response: { resultsPath: "data", idField: "id" },
      },
      contactFieldMapping: {
        displayName: "{{firstName}} {{lastName}}",
        email: "email",
        phone: "phone",
        company: "accountName",
      },
      crmLink: {
        urlTemplate: "https://desk.zoho.com/support/{{orgId}}/ShowHomePage.do#Contacts/dv/{{recordId}}",
      },
      healthCheck: { endpoint: "/organizations", method: "GET", expectedStatus: 200 },
    },
  },

  // ──────────────── JIRA SERVICE MANAGEMENT ────────────────
  {
    slug: "jira-sm",
    name: "Jira Service Management",
    shortDesc: "Screen-pop and customer lookup with Jira Service Management",
    description: "Config-driven connector for Jira Service Management with OAuth2 (Atlassian), customer search, and issue creation.",
    category: "HELPDESK" as const,
    tier: "CONFIG_DRIVEN" as const,
    authType: "oauth2",
    status: "DRAFT" as const,
    vendorUrl: "https://www.atlassian.com/software/jira/service-management",
    docsUrl: "https://developer.atlassian.com/cloud/jira/service-desk/rest/intro/",
    iconName: "jira",
    prerequisites: [
      "Jira Service Management Cloud instance",
      "Atlassian Developer account to register an OAuth 2.0 app",
      "Your Jira Cloud site URL",
    ],
    setupSteps: makeSetupSteps("jira-sm", {
      portalName: "Atlassian Developer App",
      portalUrl: "https://developer.atlassian.com/console/myapps/",
      portalInstructions: "1. Go to [Atlassian Developer Console](https://developer.atlassian.com/console/myapps/)\n2. Create a new **OAuth 2.0 (3LO)** app\n3. Under **Authorization**, add the **Callback URL** below\n4. Add scopes: `read:servicedesk-request`, `write:servicedesk-request`, `read:jira-user`\n5. Note the **Client ID** and **Secret**",
      credentialFields: [
        { key: "siteUrl", label: "Jira Site URL", type: "url", required: true, placeholder: "https://yoursite.atlassian.net" },
        { key: "clientId", label: "Client ID", type: "text", required: true },
        { key: "clientSecret", label: "Client Secret", type: "secret", required: true },
      ],
      oauthButtonLabel: "Connect Jira SM",
    }),
    config: {
      apiBaseUrl: "https://api.atlassian.com/ex/jira",
      auth: {
        type: "oauth2",
        oauth2: {
          authorizeUrl: "https://auth.atlassian.com/authorize",
          tokenUrl: "https://auth.atlassian.com/oauth/token",
          scopes: ["read:servicedesk-request", "write:servicedesk-request", "read:jira-user", "offline_access"],
          tokenPlacement: "header",
          tokenPrefix: "Bearer",
          extraAuthParams: { audience: "api.atlassian.com", prompt: "consent" },
        },
      },
      contactSearch: {
        endpoint: "/rest/api/3/user/search",
        method: "GET",
        request: { queryParams: { query: "{{query}}", maxResults: "5" } },
        response: { resultsPath: "$", idField: "accountId" },
      },
      contactFieldMapping: {
        displayName: "displayName",
        email: "emailAddress",
        avatarUrl: "avatarUrls.48x48",
      },
      crmLink: {
        urlTemplate: "https://yoursite.atlassian.net/people/{{recordId}}",
      },
      healthCheck: { endpoint: "/rest/api/3/myself", method: "GET", expectedStatus: 200 },
    },
  },

  // ──────────────── HELP SCOUT ────────────────
  {
    slug: "helpscout",
    name: "Help Scout",
    shortDesc: "Screen-pop and customer lookup with Help Scout",
    description: "Config-driven connector for Help Scout with OAuth2, customer search, and conversation note logging.",
    category: "HELPDESK" as const,
    tier: "CONFIG_DRIVEN" as const,
    authType: "oauth2",
    status: "DRAFT" as const,
    vendorUrl: "https://www.helpscout.com/",
    docsUrl: "https://developer.helpscout.com/mailbox-api/",
    iconName: "helpscout",
    prerequisites: [
      "Help Scout account (Standard plan or higher)",
      "Admin access to create an OAuth application",
    ],
    setupSteps: makeSetupSteps("helpscout", {
      portalName: "Help Scout OAuth App",
      portalUrl: "https://secure.helpscout.net/",
      portalInstructions: "1. Go to **Your Profile > My Apps**\n2. Click **Create My App**\n3. Set the **Redirection URL** to the value below\n4. Note the **App ID** (Client ID) and **App Secret**",
      credentialFields: [
        { key: "clientId", label: "App ID", type: "text", required: true },
        { key: "clientSecret", label: "App Secret", type: "secret", required: true },
      ],
      oauthButtonLabel: "Connect Help Scout",
    }),
    config: {
      apiBaseUrl: "https://api.helpscout.net/v2",
      auth: {
        type: "oauth2",
        oauth2: {
          authorizeUrl: "https://secure.helpscout.net/authentication/authorizeClientApplication",
          tokenUrl: "https://api.helpscout.net/v2/oauth2/token",
          scopes: [],
          tokenPlacement: "header",
          tokenPrefix: "Bearer",
        },
      },
      contactSearch: {
        endpoint: "/customers",
        method: "GET",
        request: { queryParams: { query: "(phone:\"{{phone}}\")", page: "1" } },
        response: { resultsPath: "_embedded.customers", idField: "id" },
      },
      contactFieldMapping: {
        displayName: "{{firstName}} {{lastName}}",
        email: "_embedded.emails.0.value",
        phone: "_embedded.phones.0.value",
        company: "company",
        title: "jobTitle",
      },
      crmLink: {
        urlTemplate: "https://secure.helpscout.net/customer/{{recordId}}/",
      },
      healthCheck: { endpoint: "/users/me", method: "GET", expectedStatus: 200 },
    },
  },

  // ──────────────── FRONT ────────────────
  {
    slug: "front",
    name: "Front",
    shortDesc: "Screen-pop and contact lookup with Front",
    description: "Config-driven connector for Front with OAuth2, contact search, and conversation tagging.",
    category: "HELPDESK" as const,
    tier: "CONFIG_DRIVEN" as const,
    authType: "oauth2",
    status: "DRAFT" as const,
    vendorUrl: "https://front.com/",
    docsUrl: "https://dev.frontapp.com/reference/introduction",
    iconName: "front",
    prerequisites: [
      "Front account (Starter plan or higher)",
      "Admin access to create an OAuth app in Front",
    ],
    setupSteps: makeSetupSteps("front", {
      portalName: "Front OAuth App",
      portalUrl: "https://app.frontapp.com/",
      portalInstructions: "1. Go to **Settings > Developers > OAuth Apps**\n2. Click **New app**\n3. Set the **Redirect URI** to the value below\n4. Note the **Client ID** and **Client Secret**",
      credentialFields: [
        { key: "clientId", label: "Client ID", type: "text", required: true },
        { key: "clientSecret", label: "Client Secret", type: "secret", required: true },
      ],
      oauthButtonLabel: "Connect Front",
    }),
    config: {
      apiBaseUrl: "https://api2.frontapp.com",
      auth: {
        type: "oauth2",
        oauth2: {
          authorizeUrl: "https://app.frontapp.com/oauth/authorize",
          tokenUrl: "https://app.frontapp.com/oauth/token",
          scopes: [],
          tokenPlacement: "header",
          tokenPrefix: "Bearer",
        },
      },
      contactSearch: {
        endpoint: "/contacts/search",
        method: "POST",
        request: {
          bodyTemplate: JSON.stringify({ query: "{{phone}}", limit: 5 }),
        },
        response: { resultsPath: "_results", idField: "id" },
      },
      contactFieldMapping: {
        displayName: "name",
        email: "handles.0.handle",
        phone: "handles.1.handle",
        company: "groups.0.name",
      },
      crmLink: {
        urlTemplate: "https://app.frontapp.com/contacts/{{recordId}}",
      },
      healthCheck: { endpoint: "/me", method: "GET", expectedStatus: 200 },
    },
  },

  // ──────────────── HAPPYFOX ────────────────
  {
    slug: "happyfox",
    name: "HappyFox",
    shortDesc: "Screen-pop and ticket lookup with HappyFox Helpdesk",
    description: "Config-driven connector for HappyFox with API key auth, contact search, and ticket note logging.",
    category: "HELPDESK" as const,
    tier: "CONFIG_DRIVEN" as const,
    authType: "api_key",
    status: "DRAFT" as const,
    vendorUrl: "https://www.happyfox.com/",
    docsUrl: "https://support.happyfox.com/kb/article/479-happyfox-api-documentation",
    iconName: "happyfox",
    prerequisites: [
      "HappyFox account (Enterprise plan for API access)",
      "API key and Auth Code from HappyFox admin",
      "Your HappyFox subdomain",
    ],
    setupSteps: [
      {
        id: "domain",
        title: "Enter Subdomain",
        type: "credentials",
        fields: [
          { key: "subdomain", label: "Subdomain", type: "text", required: true, placeholder: "yourcompany" },
        ],
      },
      {
        id: "api-key",
        title: "Get API Credentials",
        type: "instruction",
        content: "1. Log in to HappyFox as admin\n2. Go to **Manage > Integrations > API**\n3. Enable the API and copy the **API Key** and **Auth Code**",
      },
      {
        id: "credentials",
        title: "Enter Credentials",
        type: "credentials",
        fields: [
          { key: "apiKey", label: "API Key", type: "text", required: true },
          { key: "authCode", label: "Auth Code", type: "secret", required: true },
        ],
      },
      { id: "test-search", title: "Test Contact Search", type: "test", testId: "contact_search" },
      { id: "activate", title: "Activate", type: "activate" },
    ],
    config: {
      apiBaseUrl: "https://yourcompany.happyfox.com/api/1.1/json",
      auth: {
        type: "api_key",
        apiKey: { headerName: "Authorization", prefix: "Basic " },
      },
      contactSearch: {
        endpoint: "/users",
        method: "GET",
        request: { queryParams: { q: "{{phone}}", page: "1", size: "5" } },
        response: { resultsPath: "data", idField: "id" },
      },
      contactFieldMapping: {
        displayName: "name",
        email: "email",
        phone: "phones.0.number",
      },
      healthCheck: { endpoint: "/me", method: "GET", expectedStatus: 200 },
    },
  },

  // ──────────────── KAYAKO ────────────────
  {
    slug: "kayako",
    name: "Kayako",
    shortDesc: "Screen-pop and customer lookup with Kayako",
    description: "Config-driven connector for Kayako with API key auth, user search, and conversation note logging.",
    category: "HELPDESK" as const,
    tier: "CONFIG_DRIVEN" as const,
    authType: "api_key",
    status: "DRAFT" as const,
    vendorUrl: "https://kayako.com/",
    docsUrl: "https://developer.kayako.com/api/v1/reference",
    iconName: "kayako",
    prerequisites: [
      "Kayako account with API access",
      "Admin access to generate credentials",
      "Your Kayako subdomain",
    ],
    setupSteps: [
      {
        id: "domain",
        title: "Enter Subdomain",
        type: "credentials",
        fields: [
          { key: "subdomain", label: "Subdomain", type: "text", required: true, placeholder: "yourcompany" },
        ],
      },
      {
        id: "credentials",
        title: "Enter Credentials",
        type: "credentials",
        fields: [
          { key: "email", label: "Admin Email", type: "text", required: true },
          { key: "apiKey", label: "API Key / Password", type: "secret", required: true },
        ],
      },
      { id: "test-search", title: "Test Customer Search", type: "test", testId: "contact_search" },
      { id: "activate", title: "Activate", type: "activate" },
    ],
    config: {
      apiBaseUrl: "https://yourcompany.kayako.com/api/v1",
      auth: {
        type: "api_key",
        apiKey: { headerName: "Authorization", prefix: "Basic " },
      },
      contactSearch: {
        endpoint: "/users",
        method: "GET",
        request: { queryParams: { query: "{{phone}}", limit: "5" } },
        response: { resultsPath: "data", idField: "id" },
      },
      contactFieldMapping: {
        displayName: "full_name",
        email: "emails.0.email",
        phone: "phones.0.number",
        company: "organization.name",
      },
      healthCheck: { endpoint: "/me", method: "GET", expectedStatus: 200 },
    },
  },

  // ──────────────── SAP SALES CLOUD ────────────────
  {
    slug: "sap-sales",
    name: "SAP Sales Cloud",
    shortDesc: "Screen-pop and contact lookup with SAP Sales Cloud",
    description: "Config-driven connector for SAP Sales Cloud with OAuth2, OData contact search, and activity logging.",
    category: "CRM" as const,
    tier: "CONFIG_DRIVEN" as const,
    authType: "oauth2",
    status: "DRAFT" as const,
    vendorUrl: "https://www.sap.com/products/crm.html",
    docsUrl: "https://help.sap.com/docs/SAP_SALES_CLOUD",
    iconName: "sap",
    prerequisites: [
      "SAP Sales Cloud tenant",
      "Admin access to register an OAuth2 client",
      "Your SAP tenant URL",
    ],
    setupSteps: makeSetupSteps("sap-sales", {
      portalName: "SAP OAuth2 Client",
      portalUrl: "https://help.sap.com/",
      portalInstructions: "1. Go to **Administrator > OAuth 2.0 Client Registration**\n2. Register a new client\n3. Set the **Redirect URI** to the value below\n4. Note the **Client ID** and **Client Secret**",
      credentialFields: [
        { key: "tenantUrl", label: "Tenant URL", type: "url", required: true, placeholder: "https://myXXXXXX.crm.ondemand.com" },
        { key: "clientId", label: "Client ID", type: "text", required: true },
        { key: "clientSecret", label: "Client Secret", type: "secret", required: true },
      ],
      oauthButtonLabel: "Connect SAP Sales",
    }),
    config: {
      apiBaseUrl: "https://myXXXXXX.crm.ondemand.com/sap/c4c/odata/v1/c4codataapi",
      auth: {
        type: "oauth2",
        oauth2: {
          authorizeUrl: "https://myXXXXXX.crm.ondemand.com/sap/bc/sec/oauth2/authorize",
          tokenUrl: "https://myXXXXXX.crm.ondemand.com/sap/bc/sec/oauth2/token",
          scopes: ["API_BUSINESS_PARTNER_0001"],
          tokenPlacement: "header",
          tokenPrefix: "Bearer",
        },
      },
      contactSearch: {
        endpoint: "/ContactCollection",
        method: "GET",
        request: {
          queryParams: {
            "$filter": "substringof('{{phone}}',Phone) or substringof('{{phone}}',Mobile)",
            "$select": "ContactID,FirstName,LastName,EMail,Phone,Mobile,AccountName,JobTitle",
            "$top": "5",
            "$format": "json",
          },
        },
        response: { resultsPath: "d.results", idField: "ContactID" },
      },
      contactFieldMapping: {
        displayName: "{{FirstName}} {{LastName}}",
        email: "EMail",
        phone: "Phone || Mobile",
        company: "AccountName",
        title: "JobTitle",
      },
      healthCheck: { endpoint: "/$metadata", method: "GET", expectedStatus: 200 },
    },
  },

  // ──────────────── ORACLE CX SALES ────────────────
  {
    slug: "oracle-cx",
    name: "Oracle CX Sales",
    shortDesc: "Screen-pop and contact lookup with Oracle CX Sales",
    description: "Config-driven connector for Oracle CX Sales (formerly Oracle Sales Cloud) with OAuth2, contact search, and activity logging.",
    category: "CRM" as const,
    tier: "CONFIG_DRIVEN" as const,
    authType: "oauth2",
    status: "DRAFT" as const,
    vendorUrl: "https://www.oracle.com/cx/sales/",
    docsUrl: "https://docs.oracle.com/en/cloud/saas/sales/faaps/",
    iconName: "oracle",
    prerequisites: [
      "Oracle CX Sales instance",
      "Admin access to register an OAuth application in Oracle IDCS",
      "Your Oracle CX instance URL",
    ],
    setupSteps: makeSetupSteps("oracle-cx", {
      portalName: "Oracle IDCS OAuth App",
      portalUrl: "https://cloud.oracle.com/",
      portalInstructions: "1. Go to **Identity Cloud Service (IDCS) > Applications**\n2. Create a **Confidential Application**\n3. Under **Client Configuration**, add the **Redirect URL** below\n4. Note the **Client ID** and **Client Secret**",
      credentialFields: [
        { key: "instanceUrl", label: "CX Instance URL", type: "url", required: true, placeholder: "https://yourinstance.fs.us2.oraclecloud.com" },
        { key: "clientId", label: "Client ID", type: "text", required: true },
        { key: "clientSecret", label: "Client Secret", type: "secret", required: true },
      ],
      oauthButtonLabel: "Connect Oracle CX",
    }),
    config: {
      apiBaseUrl: "https://yourinstance.fs.us2.oraclecloud.com/salesApi/resources",
      auth: {
        type: "oauth2",
        oauth2: {
          authorizeUrl: "https://idcs-XXXXX.identity.oraclecloud.com/oauth2/v1/authorize",
          tokenUrl: "https://idcs-XXXXX.identity.oraclecloud.com/oauth2/v1/token",
          scopes: ["urn:opc:resource:consumer::all"],
          tokenPlacement: "header",
          tokenPrefix: "Bearer",
        },
      },
      contactSearch: {
        endpoint: "/latest/contacts",
        method: "GET",
        request: {
          queryParams: {
            q: "WorkPhoneNumber LIKE '*{{phone}}*' OR MobilePhoneNumber LIKE '*{{phone}}*'",
            limit: "5",
            fields: "PartyId,ContactName,EmailAddress,WorkPhoneNumber,MobilePhoneNumber,AccountName,JobTitle",
          },
        },
        response: { resultsPath: "items", idField: "PartyId" },
      },
      contactFieldMapping: {
        displayName: "ContactName",
        email: "EmailAddress",
        phone: "WorkPhoneNumber || MobilePhoneNumber",
        company: "AccountName",
        title: "JobTitle",
      },
      healthCheck: { endpoint: "/latest/contacts?limit=1", method: "GET", expectedStatus: 200 },
    },
  },

  // ──────────────── ODOO CRM ────────────────
  {
    slug: "odoo",
    name: "Odoo CRM",
    shortDesc: "Screen-pop and contact lookup with Odoo CRM",
    description: "Config-driven connector for Odoo CRM with API key auth (JSON-RPC), partner search, and phone call logging.",
    category: "CRM" as const,
    tier: "CONFIG_DRIVEN" as const,
    authType: "api_key",
    status: "DRAFT" as const,
    vendorUrl: "https://www.odoo.com/",
    docsUrl: "https://www.odoo.com/documentation/17.0/developer/reference/external_api.html",
    iconName: "odoo",
    prerequisites: [
      "Odoo instance (Community or Enterprise, v14+)",
      "User with API access",
      "Your Odoo instance URL and database name",
    ],
    setupSteps: [
      {
        id: "instance",
        title: "Enter Instance Details",
        type: "credentials",
        fields: [
          { key: "instanceUrl", label: "Odoo URL", type: "url", required: true, placeholder: "https://yourcompany.odoo.com" },
          { key: "database", label: "Database Name", type: "text", required: true, placeholder: "yourcompany" },
        ],
      },
      {
        id: "api-key",
        title: "Get API Key",
        type: "instruction",
        content: "1. Log in to Odoo\n2. Go to **Settings > Users > Your User > Preferences**\n3. Under **Account Security**, click **New API Key**\n4. Enter a description and copy the key",
      },
      {
        id: "credentials",
        title: "Enter API Key",
        type: "credentials",
        fields: [
          { key: "login", label: "Login (email)", type: "text", required: true },
          { key: "apiKey", label: "API Key", type: "secret", required: true },
        ],
      },
      { id: "test-search", title: "Test Contact Search", type: "test", testId: "contact_search" },
      { id: "activate", title: "Activate", type: "activate" },
    ],
    config: {
      apiBaseUrl: "https://yourcompany.odoo.com",
      auth: {
        type: "api_key",
        apiKey: { headerName: "Authorization", prefix: "Basic " },
      },
      contactSearch: {
        endpoint: "/api/v1/search_read",
        method: "POST",
        request: {
          bodyTemplate: JSON.stringify({
            model: "res.partner",
            domain: ["|", ["phone", "ilike", "{{phone}}"], ["mobile", "ilike", "{{phone}}"]],
            fields: ["id", "name", "email", "phone", "mobile", "company_name", "function"],
            limit: 5,
          }),
        },
        response: { resultsPath: "result", idField: "id" },
      },
      contactFieldMapping: {
        displayName: "name",
        email: "email",
        phone: "phone || mobile",
        company: "company_name",
        title: "function",
      },
      crmLink: {
        urlTemplate: "https://yourcompany.odoo.com/web#id={{recordId}}&model=res.partner&view_type=form",
      },
      healthCheck: { endpoint: "/web/session/get_session_info", method: "POST", expectedStatus: 200 },
    },
  },

  // ──────────────── CREATIO ────────────────
  {
    slug: "creatio",
    name: "Creatio",
    shortDesc: "Screen-pop and contact lookup with Creatio CRM",
    description: "Config-driven connector for Creatio (formerly bpm'online) with OAuth2, OData contact search, and activity logging.",
    category: "CRM" as const,
    tier: "CONFIG_DRIVEN" as const,
    authType: "oauth2",
    status: "DRAFT" as const,
    vendorUrl: "https://www.creatio.com/",
    docsUrl: "https://academy.creatio.com/docs/developer/integrations/",
    iconName: "creatio",
    prerequisites: [
      "Creatio instance (Sales, Service, or Marketing edition)",
      "Admin access to register an OAuth application",
      "Your Creatio instance URL",
    ],
    setupSteps: makeSetupSteps("creatio", {
      portalName: "Creatio OAuth App",
      portalUrl: "https://academy.creatio.com/",
      portalInstructions: "1. Log in to Creatio as admin\n2. Go to **System Designer > Integration with external services**\n3. Add a new OAuth 2.0 identity provider\n4. Set the **Redirect URI** to the value below\n5. Note the **Client ID** and **Client Secret**",
      credentialFields: [
        { key: "instanceUrl", label: "Creatio URL", type: "url", required: true, placeholder: "https://yourcompany.creatio.com" },
        { key: "clientId", label: "Client ID", type: "text", required: true },
        { key: "clientSecret", label: "Client Secret", type: "secret", required: true },
      ],
      oauthButtonLabel: "Connect Creatio",
    }),
    config: {
      apiBaseUrl: "https://yourcompany.creatio.com/0/odata",
      auth: {
        type: "oauth2",
        oauth2: {
          authorizeUrl: "https://yourcompany.creatio.com/0/ServiceModel/AuthService.svc/Login",
          tokenUrl: "https://yourcompany.creatio.com/connect/token",
          scopes: [],
          tokenPlacement: "header",
          tokenPrefix: "Bearer",
        },
      },
      contactSearch: {
        endpoint: "/Contact",
        method: "GET",
        request: {
          queryParams: {
            "$filter": "contains(Phone,'{{phone}}') or contains(MobilePhone,'{{phone}}')",
            "$select": "Id,Name,Email,Phone,MobilePhone,Account/Name,JobTitle",
            "$expand": "Account($select=Name)",
            "$top": "5",
          },
        },
        response: { resultsPath: "value", idField: "Id" },
      },
      contactFieldMapping: {
        displayName: "Name",
        email: "Email",
        phone: "Phone || MobilePhone",
        company: "Account.Name",
        title: "JobTitle",
      },
      crmLink: {
        urlTemplate: "https://yourcompany.creatio.com/Nui/ViewModule.aspx#CardModuleV2/ContactPageV2/edit/{{recordId}}",
      },
      healthCheck: { endpoint: "/Contact?$top=1", method: "GET", expectedStatus: 200 },
    },
  },
];

// ---------- main ----------

async function main() {
  console.log("Seeding marketplace connector definitions...\n");

  for (const c of connectors) {
    const existing = await prisma.connectorDefinition.findUnique({
      where: { slug: c.slug },
    });

    if (existing) {
      // Update marketplace metadata only — preserve existing config & status
      await prisma.connectorDefinition.update({
        where: { slug: c.slug },
        data: {
          name: c.name,
          description: c.description,
          shortDesc: c.shortDesc,
          category: c.category,
          tier: c.tier,
          authType: c.authType,
          vendorUrl: c.vendorUrl,
          docsUrl: c.docsUrl,
          iconName: c.iconName,
          prerequisites: c.prerequisites as never,
          setupSteps: c.setupSteps as never,
          config: c.config as never,
        },
      });
      console.log(`  Updated: ${c.slug} (config + metadata updated)`);
    } else {
      await prisma.connectorDefinition.create({
        data: {
          slug: c.slug,
          name: c.name,
          description: c.description,
          shortDesc: c.shortDesc,
          category: c.category,
          tier: c.tier,
          authType: c.authType,
          status: c.status,
          vendorUrl: c.vendorUrl,
          docsUrl: c.docsUrl,
          iconName: c.iconName,
          prerequisites: c.prerequisites as never,
          setupSteps: c.setupSteps as never,
          config: c.config as never,
        },
      });
      console.log(`  Created: ${c.slug} (${c.status})`);
    }
  }

  console.log(`\nDone. Seeded ${connectors.length} connector definitions.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

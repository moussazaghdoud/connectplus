/**
 * Seed script for Connector Marketplace definitions.
 *
 * Upserts 9 connector definitions:
 *   - zoho-crm (ACTIVE, CONFIG_DRIVEN) — preserves existing config if present
 *   - hubspot  (ACTIVE, CODE_BASED)    — metadata row for marketplace display
 *   - salesforce, dynamics-365, zendesk, freshdesk, servicenow, pipedrive, intercom (DRAFT)
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
      portalUrl: "https://api-console.zoho.eu/",
      portalInstructions: "1. Go to [Zoho API Console](https://api-console.zoho.eu/)\n2. Click **Add Client** > **Server-based Applications**\n3. Set the **Authorized Redirect URI** to the value below",
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
      apiBaseUrl: "https://www.zohoapis.eu/crm/v2",
      auth: {
        type: "oauth2",
        oauth2: {
          authorizeUrl: "https://accounts.zoho.eu/oauth/v2/auth",
          tokenUrl: "https://accounts.zoho.eu/oauth/v2/token",
          scopes: ["ZohoCRM.modules.contacts.READ", "ZohoCRM.modules.calls.CREATE"],
          tokenPlacement: "header",
          tokenPrefix: "Zoho-oauthtoken",
          extraAuthParams: { access_type: "offline", prompt: "consent" },
        },
      },
      contactSearch: {
        endpoint: "/Contacts/search",
        method: "GET",
        request: { queryParams: { word: "{{query}}" } },
        response: { resultsPath: "data", idField: "id" },
      },
      contactFieldMapping: {
        displayName: "{{First_Name}} {{Last_Name}}",
        email: "Email",
        phone: "Phone || Mobile",
        company: "Company",
        title: "Title",
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
      apiBaseUrl: "https://yourcompany.my.salesforce.com/services/data/v59.0",
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
      apiBaseUrl: "https://yourorg.crm.dynamics.com/api/data/v9.2",
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
        },
      });
      console.log(`  Updated: ${c.slug} (preserved config & status)`);
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

  console.log("\nDone. Seeded", connectors.length, "connector definitions.");

  
  // Generated from blueprint: salesforce-crm
  await prisma.connectorDefinition.upsert({
    where: { slug: "salesforce-crm" },
    update: {
      name: "Salesforce CRM",
      shortDesc: "Contact search, activity logging, and deal sync with Salesforce CRM",
      category: "CRM",
      tier: "CONFIG_DRIVEN",
      authType: "oauth2",
      vendorUrl: "https://www.salesforce.com/",
      docsUrl: "https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/intro_rest.htm",
      prerequisites: ["Salesforce Enterprise Edition or higher","Connected App configured with OAuth2","API access enabled for user"],
    },
    create: {
      slug: "salesforce-crm",
      name: "Salesforce CRM",
      description: "Contact search, activity logging, and deal sync with Salesforce CRM",
      shortDesc: "Contact search, activity logging, and deal sync with Salesforce CRM",
      status: "DRAFT",
      version: 1,
      config: {},
      category: "CRM",
      tier: "CONFIG_DRIVEN",
      authType: "oauth2",
      vendorUrl: "https://www.salesforce.com/",
      docsUrl: "https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/intro_rest.htm",
      prerequisites: ["Salesforce Enterprise Edition or higher","Connected App configured with OAuth2","API access enabled for user"],
      setupSteps: [],
    },
  });
  console.log("  Upserted salesforce-crm");

  // --- END GENERATED CONNECTORS ---
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

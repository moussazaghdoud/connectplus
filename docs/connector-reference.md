# Connector Reference — CRM Configuration Guide

Quick reference for creating connectors in the ConnectPlus Wizard.

## OAuth 2.0 CRMs

### Salesforce
| Field | Value |
|-------|-------|
| Slug | `salesforce` |
| API Base URL | `https://yourinstance.salesforce.com/services/data/v59.0` |
| Auth Type | OAuth 2.0 |
| Authorize URL | `https://login.salesforce.com/services/oauth2/authorize` |
| Token URL | `https://login.salesforce.com/services/oauth2/token` |
| Scopes | `api, refresh_token, offline_access` |
| Token Placement | Header |
| Token Prefix | `Bearer` |
| **Contact Search** | |
| Endpoint | `/search` |
| Method | `GET` |
| Query Parameters | `{"q":"FIND {{{query}}} IN ALL FIELDS RETURNING Contact(Id,FirstName,LastName,Email,Phone,Account.Name,Title LIMIT 20)"}` |
| Results Path | `searchRecords` |
| ID Field | `Id` |
| **Field Mapping** | |
| Display Name | `{{FirstName}} {{LastName}}` |
| Email | `Email` |
| Phone | `Phone \|\| MobilePhone` |
| Company | `Account.Name` |
| Job Title | `Title` |

### HubSpot
| Field | Value |
|-------|-------|
| Slug | `hubspot` |
| API Base URL | `https://api.hubapi.com` |
| Auth Type | OAuth 2.0 |
| Authorize URL | `https://app.hubspot.com/oauth/authorize` |
| Token URL | `https://api.hubapi.com/oauth/v1/token` |
| Scopes | `crm.objects.contacts.read, crm.objects.contacts.write, crm.objects.deals.read` |
| Token Placement | Header |
| Token Prefix | `Bearer` |
| **Contact Search** | |
| Endpoint | `/crm/v3/objects/contacts/search` |
| Method | `POST` |
| Body Template | `{"query":"{{query}}","limit":20,"properties":["firstname","lastname","email","phone","mobilephone","company","jobtitle"]}` |
| Results Path | `results` |
| ID Field | `id` |
| **Field Mapping** | |
| Display Name | `{{properties.firstname}} {{properties.lastname}}` |
| Email | `properties.email` |
| Phone | `properties.phone \|\| properties.mobilephone` |
| Company | `properties.company` |
| Job Title | `properties.jobtitle` |

### Zoho CRM
| Field | Value |
|-------|-------|
| Slug | `zoho-crm` |
| API Base URL | `https://www.zohoapis.com/crm/v2` |
| Auth Type | OAuth 2.0 |
| Authorize URL | `https://accounts.zoho.com/oauth/v2/auth` |
| Token URL | `https://accounts.zoho.com/oauth/v2/token` |
| Scopes | `ZohoCRM.modules.contacts.READ, ZohoCRM.modules.contacts.WRITE, ZohoCRM.modules.calls.CREATE` |
| Token Placement | Header |
| Token Prefix | `Zoho-oauthtoken` |
| **Contact Search** | |
| Endpoint | `/Contacts/search` |
| Method | `GET` |
| Query Parameters | `{"word":"{{query}}"}` |
| Results Path | `data` |
| ID Field | `id` |
| **Field Mapping** | |
| Display Name | `{{First_Name}} {{Last_Name}}` |
| Email | `Email` |
| Phone | `Phone \|\| Mobile` |
| Company | `Company` |
| Job Title | `Title` |

### Microsoft Dynamics 365
| Field | Value |
|-------|-------|
| Slug | `dynamics-365` |
| API Base URL | `https://yourorg.api.crm.dynamics.com/api/data/v9.2` |
| Auth Type | OAuth 2.0 |
| Authorize URL | `https://login.microsoftonline.com/common/oauth2/v2.0/authorize` |
| Token URL | `https://login.microsoftonline.com/common/oauth2/v2.0/token` |
| Scopes | `https://yourorg.crm.dynamics.com/.default, offline_access` |
| Token Placement | Header |
| Token Prefix | `Bearer` |
| **Contact Search** | |
| Endpoint | `/contacts` |
| Method | `GET` |
| Query Parameters | `{"$filter":"contains(fullname,'{{query}}') or contains(emailaddress1,'{{query}}') or contains(telephone1,'{{query}}')","$top":"20"}` |
| Results Path | `value` |
| ID Field | `contactid` |
| **Field Mapping** | |
| Display Name | `fullname` |
| Email | `emailaddress1` |
| Phone | `telephone1 \|\| mobilephone` |
| Company | `_parentcustomerid_value` |
| Job Title | `jobtitle` |

### ServiceNow
| Field | Value |
|-------|-------|
| Slug | `servicenow` |
| API Base URL | `https://yourinstance.service-now.com/api/now` |
| Auth Type | OAuth 2.0 |
| Authorize URL | `https://yourinstance.service-now.com/oauth_auth.do` |
| Token URL | `https://yourinstance.service-now.com/oauth_token.do` |
| Scopes | `useraccount` |
| Token Placement | Header |
| Token Prefix | `Bearer` |
| **Contact Search** | |
| Endpoint | `/table/customer_contact` |
| Method | `GET` |
| Query Parameters | `{"sysparm_query":"nameLIKE{{query}}^ORemailLIKE{{query}}^ORphoneLIKE{{query}}","sysparm_limit":"20"}` |
| Results Path | `result` |
| ID Field | `sys_id` |
| **Field Mapping** | |
| Display Name | `name` |
| Email | `email` |
| Phone | `phone \|\| mobile_phone` |
| Company | `company.display_value` |
| Job Title | `title` |

### SugarCRM
| Field | Value |
|-------|-------|
| Slug | `sugarcrm` |
| API Base URL | `https://yourinstance.sugarondemand.com/rest/v11_5` |
| Auth Type | OAuth 2.0 |
| Authorize URL | `https://yourinstance.sugarondemand.com/rest/v11_5/oauth2/authorize` |
| Token URL | `https://yourinstance.sugarondemand.com/rest/v11_5/oauth2/token` |
| Scopes | `offline` |
| Token Placement | Header |
| Token Prefix | `Bearer` |
| **Contact Search** | |
| Endpoint | `/Contacts/filter` |
| Method | `POST` |
| Body Template | `{"filter":[{"$or":[{"first_name":{"$starts":"{{query}}"}},{"last_name":{"$starts":"{{query}}"}},{"email":{"$starts":"{{query}}"}}]}],"max_num":20}` |
| Results Path | `records` |
| ID Field | `id` |
| **Field Mapping** | |
| Display Name | `{{first_name}} {{last_name}}` |
| Email | `email1` |
| Phone | `phone_work \|\| phone_mobile` |
| Company | `account_name` |
| Job Title | `title` |

### Slack
| Field | Value |
|-------|-------|
| Slug | `slack` |
| API Base URL | `https://slack.com/api` |
| Auth Type | OAuth 2.0 |
| Authorize URL | `https://slack.com/oauth/v2/authorize` |
| Token URL | `https://slack.com/api/oauth.v2.access` |
| Scopes | `users:read, chat:write, commands` |
| Token Placement | Header |
| Token Prefix | `Bearer` |
| **Contact Search** | |
| Endpoint | `/users.list` |
| Method | `GET` |
| Query Parameters | `{"limit":"200"}` |
| Results Path | `members` |
| ID Field | `id` |
| **Field Mapping** | |
| Display Name | `real_name` |
| Email | `profile.email` |
| Phone | `profile.phone` |
| Company | `profile.title` |
| Job Title | `profile.title` |

### Microsoft Teams
| Field | Value |
|-------|-------|
| Slug | `teams` |
| API Base URL | `https://graph.microsoft.com/v1.0` |
| Auth Type | OAuth 2.0 |
| Authorize URL | `https://login.microsoftonline.com/common/oauth2/v2.0/authorize` |
| Token URL | `https://login.microsoftonline.com/common/oauth2/v2.0/token` |
| Scopes | `User.Read, Contacts.Read, CallRecords.Read.All, offline_access` |
| Token Placement | Header |
| Token Prefix | `Bearer` |
| **Contact Search** | |
| Endpoint | `/me/contacts` |
| Method | `GET` |
| Query Parameters | `{"$filter":"contains(displayName,'{{query}}') or contains(emailAddresses/any(e:contains(e/address,'{{query}}'))","$top":"20"}` |
| Results Path | `value` |
| ID Field | `id` |
| **Field Mapping** | |
| Display Name | `displayName` |
| Email | `emailAddresses.0.address` |
| Phone | `mobilePhone \|\| businessPhones.0` |
| Company | `companyName` |
| Job Title | `jobTitle` |

### Google Contacts
| Field | Value |
|-------|-------|
| Slug | `google-contacts` |
| API Base URL | `https://people.googleapis.com/v1` |
| Auth Type | OAuth 2.0 |
| Authorize URL | `https://accounts.google.com/o/oauth2/v2/auth` |
| Token URL | `https://oauth2.googleapis.com/token` |
| Scopes | `https://www.googleapis.com/auth/contacts.readonly, https://www.googleapis.com/auth/contacts` |
| Token Placement | Header |
| Token Prefix | `Bearer` |
| **Contact Search** | |
| Endpoint | `/people:searchContacts` |
| Method | `GET` |
| Query Parameters | `{"query":"{{query}}","readMask":"names,emailAddresses,phoneNumbers,organizations","pageSize":"20"}` |
| Results Path | `results` |
| ID Field | `person.resourceName` |
| **Field Mapping** | |
| Display Name | `person.names.0.displayName` |
| Email | `person.emailAddresses.0.value` |
| Phone | `person.phoneNumbers.0.value` |
| Company | `person.organizations.0.name` |
| Job Title | `person.organizations.0.title` |

### Oracle
| Field | Value |
|-------|-------|
| Slug | `oracle` |
| API Base URL | `https://yourinstance.oraclecloud.com/crmRestApi/resources` |
| Auth Type | OAuth 2.0 |
| Authorize URL | `https://login.oracle.com/oam/oauth2/authorize` |
| Token URL | `https://login.oracle.com/oam/oauth2/token` |
| Scopes | `oracle.apigateway.invoke` |
| Token Placement | Header |
| Token Prefix | `Bearer` |
| **Contact Search** | |
| Endpoint | `/latest/contacts` |
| Method | `GET` |
| Query Parameters | `{"q":"ContactName LIKE '*{{query}}*'","limit":"20"}` |
| Results Path | `items` |
| ID Field | `ContactId` |
| **Field Mapping** | |
| Display Name | `ContactName` |
| Email | `EmailAddress` |
| Phone | `WorkPhoneNumber \|\| MobilePhoneNumber` |
| Company | `OrganizationName` |
| Job Title | `JobTitle` |

---

## API Key CRMs

### Zendesk
| Field | Value |
|-------|-------|
| Slug | `zendesk` |
| API Base URL | `https://yourcompany.zendesk.com/api/v2` |
| Auth Type | API Key |
| Header Name | `Authorization` |
| Prefix | `Bearer ` |
| **Contact Search** | |
| Endpoint | `/users/search.json` |
| Method | `GET` |
| Query Parameters | `{"query":"{{query}}"}` |
| Results Path | `users` |
| ID Field | `id` |
| **Field Mapping** | |
| Display Name | `name` |
| Email | `email` |
| Phone | `phone` |
| Company | `organization.name` |
| Job Title | `role` |

### Pipedrive
| Field | Value |
|-------|-------|
| Slug | `pipedrive` |
| API Base URL | `https://api.pipedrive.com/v1` |
| Auth Type | API Key |
| Header Name | `x-api-token` |
| Prefix | (none) |
| **Contact Search** | |
| Endpoint | `/persons/search` |
| Method | `GET` |
| Query Parameters | `{"term":"{{query}}","limit":"20"}` |
| Results Path | `data.items` |
| ID Field | `item.id` |
| **Field Mapping** | |
| Display Name | `item.name` |
| Email | `item.primary_email` |
| Phone | `item.primary_phone` |
| Company | `item.organization.name` |
| Job Title | `item.job_title` |

### Freshdesk
| Field | Value |
|-------|-------|
| Slug | `freshdesk` |
| API Base URL | `https://yourdomain.freshdesk.com/api/v2` |
| Auth Type | API Key |
| Header Name | `Authorization` |
| Prefix | `Basic ` (base64 of `apikey:X`) |
| **Contact Search** | |
| Endpoint | `/contacts/autocomplete` |
| Method | `GET` |
| Query Parameters | `{"term":"{{query}}"}` |
| Results Path | (root array — use empty or `.`) |
| ID Field | `id` |
| **Field Mapping** | |
| Display Name | `name` |
| Email | `email` |
| Phone | `phone \|\| mobile` |
| Company | `company_name` |
| Job Title | `job_title` |

### Monday.com
| Field | Value |
|-------|-------|
| Slug | `monday` |
| API Base URL | `https://api.monday.com/v2` |
| Auth Type | API Key |
| Header Name | `Authorization` |
| Prefix | `Bearer ` |
| **Contact Search** | |
| Endpoint | `/` |
| Method | `POST` |
| Body Template | `{"query":"{ items_page_by_column_values (board_id: YOUR_BOARD_ID, limit: 20, columns: [{column_id: \"name\", column_values: [\"{{query}}\"]}]) { items { id name column_values { id text } } } }"}` |
| Results Path | `data.items_page_by_column_values.items` |
| ID Field | `id` |
| **Field Mapping** | |
| Display Name | `name` |
| Email | `column_values.1.text` |
| Phone | `column_values.2.text` |
| Company | `column_values.3.text` |
| Job Title | `column_values.4.text` |

### Jira Service Management
| Field | Value |
|-------|-------|
| Slug | `jira-service-mgmt` |
| API Base URL | `https://yoursite.atlassian.net/rest/api/3` |
| Auth Type | API Key |
| Header Name | `Authorization` |
| Prefix | `Basic ` (base64 of `email:api_token`) |
| **Contact Search** | |
| Endpoint | `/user/search` |
| Method | `GET` |
| Query Parameters | `{"query":"{{query}}","maxResults":"20"}` |
| Results Path | (root array) |
| ID Field | `accountId` |
| **Field Mapping** | |
| Display Name | `displayName` |
| Email | `emailAddress` |
| Phone | (not available via API) |
| Company | (not available via API) |
| Job Title | (not available via API) |

### Vtiger
| Field | Value |
|-------|-------|
| Slug | `vtiger` |
| API Base URL | `https://yourinstance.vtiger.com/restapi/v1/vtiger/default` |
| Auth Type | API Key |
| Header Name | `Authorization` |
| Prefix | `Basic ` (base64 of `username:accesskey`) |
| **Contact Search** | |
| Endpoint | `/query` |
| Method | `GET` |
| Query Parameters | `{"query":"SELECT * FROM Contacts WHERE firstname LIKE '%{{query}}%' OR lastname LIKE '%{{query}}%' LIMIT 20;"}` |
| Results Path | `result` |
| ID Field | `id` |
| **Field Mapping** | |
| Display Name | `{{firstname}} {{lastname}}` |
| Email | `email` |
| Phone | `phone \|\| mobile` |
| Company | `account_id` |
| Job Title | `title` |

### Insightly
| Field | Value |
|-------|-------|
| Slug | `insightly` |
| API Base URL | `https://api.insightly.com/v3.1` |
| Auth Type | API Key |
| Header Name | `Authorization` |
| Prefix | `Basic ` (base64 of `apikey:`) |
| **Contact Search** | |
| Endpoint | `/Contacts/Search` |
| Method | `GET` |
| Query Parameters | `{"field_name":"FIRST_NAME","field_value":"{{query}}","top":"20"}` |
| Results Path | (root array) |
| ID Field | `CONTACT_ID` |
| **Field Mapping** | |
| Display Name | `{{FIRST_NAME}} {{LAST_NAME}}` |
| Email | `EMAIL_ADDRESS` |
| Phone | `PHONE \|\| PHONE_MOBILE` |
| Company | `ORGANISATION_NAME` |
| Job Title | `TITLE` |

---

## Basic Auth CRMs

### LDAP / Active Directory
| Field | Value |
|-------|-------|
| Slug | `ldap` |
| API Base URL | `https://yourldapproxy.company.com/api` |
| Auth Type | Basic Auth |
| Username Field | `username` |
| Password Field | `password` |
| **Contact Search** | |
| Endpoint | `/search` |
| Method | `GET` |
| Query Parameters | `{"filter":"(|(cn=*{{query}}*)(mail=*{{query}}*)(telephoneNumber=*{{query}}*))","base":"ou=people,dc=company,dc=com","limit":"20"}` |
| Results Path | `entries` |
| ID Field | `dn` |
| **Field Mapping** | |
| Display Name | `cn` |
| Email | `mail` |
| Phone | `telephoneNumber \|\| mobile` |
| Company | `o` |
| Job Title | `title` |

### SAP
| Field | Value |
|-------|-------|
| Slug | `sap` |
| API Base URL | `https://yourinstance.sapbydesign.com/sap/byd/odata/v1` |
| Auth Type | Basic Auth |
| Username Field | `username` |
| Password Field | `password` |
| **Contact Search** | |
| Endpoint | `/bcustomer/ContactCollection` |
| Method | `GET` |
| Query Parameters | `{"$filter":"substringof('{{query}}',Name)","$top":"20","$format":"json"}` |
| Results Path | `d.results` |
| ID Field | `ContactID` |
| **Field Mapping** | |
| Display Name | `Name` |
| Email | `Email` |
| Phone | `Phone \|\| Mobile` |
| Company | `AccountName` |
| Job Title | `Function` |

### Odoo
| Field | Value |
|-------|-------|
| Slug | `odoo` |
| API Base URL | `https://yourinstance.odoo.com/api` |
| Auth Type | Basic Auth |
| Username Field | `username` |
| Password Field | `password` |
| **Contact Search** | |
| Endpoint | `/search_read` |
| Method | `POST` |
| Body Template | `{"model":"res.partner","domain":[["name","ilike","{{query}}"]],"fields":["id","name","email","phone","mobile","company_name","function"],"limit":20}` |
| Results Path | `result` |
| ID Field | `id` |
| **Field Mapping** | |
| Display Name | `name` |
| Email | `email` |
| Phone | `phone \|\| mobile` |
| Company | `company_name` |
| Job Title | `function` |

---

## Notes

- Replace `yourinstance`, `yourcompany`, `yourdomain`, `yourorg`, `yoursite` with actual values
- **Token Prefix** includes trailing space where needed (e.g. `Bearer ` not `Bearer`)
- **Freshdesk, Jira, Vtiger, Insightly** use API Key auth type but send credentials as Basic auth — set the prefix to `Basic ` and the key value should be the base64-encoded `user:token` string
- All OAuth2 connectors default to **Header** placement with **Bearer** prefix unless noted otherwise
- Dynamics 365 and Teams share the same Microsoft identity platform URLs

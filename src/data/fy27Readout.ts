// FY27 Catalog Readout — structured content extracted from
// FY27_Catalog_Readout_V1.1.pptx (Version 1.1 · 22 Sep 2026)
// CONFIDENTIAL — RESTRICTED DISTRIBUTION
// Owner: Event-Support@spektrasystems.com · Sponsor: CloudLabs Customer Success

export type LabStatus = "Ready" | "In progress";
export type Readiness = "LabGuide preview" | "TOC provided";
export type RetirementBucket = "FY26 — already removed" | "FY27 — pending removal";

export interface LabUpdate {
  title: string;
  update: string;
  status: LabStatus;
}

export interface RetiredTrack {
  title: string;
  reason: string;
  bucket: RetirementBucket;
  replacement?: string;
}

export interface NewProposal {
  title: string;
  readiness: Readiness;
  duration: string;
  link?: string;
}

export const readoutMeta = {
  title: "Catalog Review FY27 Q1",
  subtitle: "Lab updates · FY27 retirements · new catalog proposals · refreshed Top 15",
  version: "1.1",
  date: "22 Sep 2026",
  owner: "Event-Support@spektrasystems.com",
  sponsor: "CloudLabs Customer Success",
  classification: "CONFIDENTIAL — RESTRICTED DISTRIBUTION",
  sourceFile: "FY27_Catalog_Readout_V1.1.pptx",
};

// ── Section 1: New Top 15 — lab updates ──────────────────────────────
export const top15Updates: LabUpdate[] = [
  {
    title: "GitHub Copilot Innovation Workshop — Mastering Copilot Across the SDLC",
    update:
      "Updated the repository-creation steps, Copilot Chat setup, and terminal and agent-configuration screenshots to the latest VS Code and GitHub interfaces and refreshed the Advanced Security and issue-assignment flows. The deck reflects the latest Copilot capabilities.",
    status: "Ready",
  },
  {
    title: "Foundry IQ — Business Intelligence to Intelligent Action",
    update: "Newly onboarded and trending topic; ready to use.",
    status: "Ready",
  },
  {
    title: "Microsoft Azure AI Agents: Hands-on Lab",
    update:
      "Refreshed the Foundry UI and screenshots, updated the GPT token configuration, added an Azure AI Search step, and strengthened validation in Labs 1 and 3. The deck reflects serverless execution, multi-agent orchestration, the new Foundry roles and refreshed links.",
    status: "Ready",
  },
  {
    title: "AI Agents using Microsoft Agent Framework",
    update:
      "Verified the updated Environment tab, the Lab 01 navigation screenshots, and the project-selection steps across both the legacy and new Foundry interfaces. The deck is updated for Agent Framework 1.0, which unifies AutoGen and Semantic Kernel in a single SDK.",
    status: "Ready",
  },
  {
    title: "AI-Assisted Development with GitHub Copilot",
    update:
      "Lab reviewed following Microsoft Build; the deck has been updated to reflect the latest GitHub release.",
    status: "Ready",
  },
  {
    title: "Build a Fabric Real-Time Intelligence Solution in a Day",
    update:
      "Updated the Fabric Portal UI for the RTI dashboard visuals. The deck reflects the latest Fabric AI functionality and multi-model support.",
    status: "Ready",
  },
  {
    title: "Chat with Your Data — Fabric",
    update:
      "Added a Fabric home-navigation step and a repository-template selection step, and updated the Fabric Data Agent navigation tab.",
    status: "Ready",
  },
  {
    title: "Fabric IQ — Unified Data to Business Intelligence",
    update: "Newly onboarded and trending topic; ready to use.",
    status: "Ready",
  },
  {
    title: "Building Security Copilot Agents using Microsoft Sentinel Data (Hands-on Lab)",
    update: "Tested and validated post-Microsoft Build; no updates required.",
    status: "Ready",
  },
  {
    title: "Build and Deploy Agentic AI Solutions",
    update:
      "Refreshed and validated.",
    status: "Ready",
  },
  {
    title: "Build Production-Ready AI Agents-Faster",
    update:
      "Refreshed and validated.",
    status: "Ready",
  },
  {
    title: "Fabric — Analyst in a Day",
    update:
      "Minor screenshot updates to make options easier to locate; all other content is current. No major update was required, and links have been refreshed to the latest content.",
    status: "Ready",
  },
  {
    title: "Fabric Copilot Hands-on Lab",
    update:
      "Refined the lab scenario, refreshed the Lakehouse and Dataflow Gen2 screenshots in Exercise 2, and streamlined the Exercise 3 steps and pop-up handling.",
    status: "Ready",
  },
  {
    title: "Hands-on with Microsoft Foundry and Agent Frameworks",
    update:
      "Updated the UI and screenshots, migrated from DeepSeek-R1 to V3.2, refreshed the repository and exercises to the latest versions, and introduced a policy restricting OpenAI model deployment. The deck reflects the new models and advanced orchestration.",
    status: "Ready",
  },
  {
    title: "Microsoft Defender for Cloud — Security Posture Management",
    update: "Tested and validated post-Microsoft Build; no updates required.",
    status: "Ready",
  },
];

// ── Section 1b: Additional 15 labs — reviewed and validated ─────────────────
export const additionalLabs: LabUpdate[] = [
  {
    title: "Hybrid Identity with Entra ID",
    update: "Tested and validated post-Microsoft Build; no updates required.",
    status: "Ready",
  },
  {
    title: "Implement Microsoft Defender for Endpoint",
    update: "Tested and validated post-Microsoft Build; no updates required.",
    status: "Ready",
  },
  {
    title: "Implementing Dynamics 365 Contact Center",
    update: "Tested and validated post-Microsoft Build; no updates required.",
    status: "Ready",
  },
  {
    title: "Infrastructure as Code with Terraform Workshop",
    update: "Tested and validated post-Microsoft Build; no updates required.",
    status: "Ready",
  },
  {
    title: "M365 Copilot Immersion Briefing Lab",
    update: "Tested and validated post-Microsoft Build; no updates required.",
    status: "Ready",
  },
  {
    title: "Modern Identity Governance & Secure Access with Microsoft Entra",
    update: "Tested and validated post-Microsoft Build; no updates required.",
    status: "Ready",
  },
  {
    title: "SQL AI App in a Day",
    update: "Tested and validated post-Microsoft Build; no updates required.",
    status: "Ready",
  },
  {
    title:
      "Get Started with Data Warehouses and Ingesting Data with Dataflows Gen2 in Microsoft Fabric",
    update: "Tested and validated post-Microsoft Build; no updates required.",
    status: "Ready",
  },
  {
    title: "Data Modernization",
    update: "Tested and validated post-Microsoft Build; no updates required.",
    status: "Ready",
  },
  {
    title: "Fabric Database Mirroring",
    update: "Tested and validated post-Microsoft Build; no updates required.",
    status: "Ready",
  },
  {
    title: "Leverage Microsoft 365 Copilot and Copilot Studio for Marketing",
    update: "Tested and validated post-Microsoft Build; no updates required.",
    status: "Ready",
  },
  {
    title: "Create and Publish Power BI Dashboards & Reports",
    update: "Tested and validated post-Microsoft Build; no updates required.",
    status: "Ready",
  },
  {
    title: "Infrastructure Migration",
    update: "Upgraded with the latest Azure Migrate updates.",
    status: "Ready",
  },
  {
    title: "Securing Repositories with GitHub Advanced Security",
    update: "Tested and validated post-Microsoft Build; no updates required.",
    status: "Ready",
  },
  {
    title: "Building and Operationalizing AI Agents with Microsoft Foundry and Agent Frameworks",
    update:
      "Refreshed the Getting Started images, the new Foundry login flow, and the MCP-connection and VS Code execution screenshots, and tidied naming and documentation. The deck reflects the latest Foundry roles, terminology and URLs.",
    status: "Ready",
  },
  {
    title: "MS Fabric Foundation for Enterprise Analytics",
    update:
      "Simplified the zoom configuration, corrected spacing and rendering issues, and aligned the instructional text to the latest terminology.",
    status: "Ready",
  },
  {
    title: "Effective Utilization of Copilot Studio",
    update:
      "Updated the agent-name, variable-property and Sales/Finance condition screenshots across Labs 03 and 05 to the latest Copilot Studio UI. The deck adds the new agent experience and guidance on Foundry IQ and agent memory.",
    status: "Ready",
  },
  {
    title: "Accelerating Development with GitHub Copilot and Copilot Chat",
    update:
      "Highlighted the login fields, refined the Exercise 1 instructions, and added terminal and schema-setup steps with a clarifying screenshot.",
    status: "Ready",
  },
  {
    title: "Leverage Microsoft 365 Copilot and Copilot Studio for Human Resources",
    update:
      "Completed a full content and screenshot refresh across Getting Started and Labs 01–04, validated the candidate-ranking scenario, and added guidance on response variability. The deck reflects the latest M365 Copilot and Copilot Studio features.",
    status: "Ready",
  },
  {
    title: "Implementing DevOps with GitHub and Azure DevOps",
    update: "Tested and validated post-Microsoft Build; no updates required.",
    status: "Ready",
  },
  {
    title: "Snowflake Integration with Microsoft Fabric (Iceberg and Data Agent)",
    update:
      "Added a scenario and architecture overview, refreshed the Fabric Portal navigation, introduced step numbering and RTI troubleshooting, and standardised the formatting.",
    status: "Ready",
  },
  {
    title: "Microsoft Defender for Cloud — AI Workload Protection",
    update: "Tested and validated post-Microsoft Build; no updates required.",
    status: "Ready",
  },
  {
    title: "Getting Started with Microsoft Foundry, Agents and the MCP Framework",
    update:
      "Updated the lab content with the new Foundry UI and refreshed terminology for agents and the overview.",
    status: "Ready",
  },
  {
    title: "Get Started with Real-Time Analytics and Data Science (Fabric)",
    update: "Tested and validated post-Microsoft Build; no updates required.",
    status: "Ready",
  },
  {
    title: "Developing AI Applications with Microsoft Foundry",
    update: "Tested and validated post-Microsoft Build; no updates required.",
    status: "Ready",
  },
  {
    title: "Building and Managing AI Agents using the Azure Agents Control Plane",
    update:
      "Updated with the latest Fabric Portal UI and the new Foundry Portal, and refreshed terminology for agents and orchestration.",
    status: "Ready",
  },
  {
    title: "GitHub Copilot — Zero to Agents",
    update: "Tested and validated post-Microsoft Build; no updates required.",
    status: "Ready",
  },
];

// ── Section 2: FY27 retirements ─────────────────────────────────────────────
export const retirements: RetiredTrack[] = [
  {
    title: "AI Developer — Microsoft Foundry and Semantic Kernel Fundamentals",
    reason: "Outdated; replaced by the three Foundry agent labs.",
    bucket: "FY27 — pending removal",
  },
  {
    title: "Analytics in MIDP with Microsoft Fabric",
    reason: "Synapse deprecated; replaced by Fabric Lakehouses.",
    bucket: "FY27 — pending removal",
  },
  {
    title: "Microsoft Dev Box for Developers",
    reason: "Dev Box service deprecated.",
    bucket: "FY27 — pending removal",
  },
  // FY26 — already removed from the RMP
  { title: "Citrix To AVD Migration", reason: "Outdated content", bucket: "FY26 — already removed", replacement: "" },
  { title: "Building a resilient IaaS architecture", reason: "Outdated content, deprecated services", bucket: "FY26 — already removed", replacement: "Azure Landing Zone" },
  { title: "Expanding Azure Virtual WAN To Support Your Global Network", reason: "Outdated content and scripts", bucket: "FY26 — already removed", replacement: "Azure Landing Zone" },
  { title: "Nerdio Manager For MSP", reason: "Outdated content, deprecated services", bucket: "FY26 — already removed", replacement: "" },
  { title: "Azure Well-Architected Resiliency Gaps Remediation", reason: "Outdated content, deprecated services", bucket: "FY26 — already removed", replacement: "Azure Landing Zone" },
  { title: "Empower Knowledge Workers Using Azure OpenAI With MS Teams And Azure Bot Service", reason: "Outdated codebase and content", bucket: "FY26 — already removed", replacement: "Can suggest agent-based labs" },
  { title: "Call Center Data Analysis Using Azure AI Services And Azure OpenAI", reason: "Can be added as a use case for AI Foundry labs", bucket: "FY26 — already removed", replacement: "" },
  { title: "Cloud Native Applications", reason: "Same content as Cloud Native Application Architecture", bucket: "FY26 — already removed", replacement: "" },
  { title: "Real-Time Analytics With Synapse", reason: "Outdated content, deprecated services", bucket: "FY26 — already removed", replacement: "Fabric-based labs" },
  { title: "Create And Run Data Pipeline With Data Factory", reason: "Outdated content, deprecated services", bucket: "FY26 — already removed", replacement: "Work With Data Lake And Data Factory Pipelines In Microsoft Fabric" },
  { title: "Advanced Azure Networking With Azure Virtual WAN", reason: "Outdated content, deprecated services", bucket: "FY26 — already removed", replacement: "Azure Landing Zone" },
  { title: "Building the business migration case with Linux and OSS DB to Azure", reason: "Outdated content, deprecated services", bucket: "FY26 — already removed", replacement: "Migrate Linux Servers To Azure" },
  { title: "Scalable Cloud Networking With Azure Virtual WAN", reason: "Outdated content, deprecated services", bucket: "FY26 — already removed", replacement: "" },
  { title: "Migrate Windows Servers To Azure", reason: "Similar content to Discover And Assess On-prem Windows & SQL Servers", bucket: "FY26 — already removed", replacement: "" },
  { title: "Low Code Development With Power Apps & Power Automate", reason: "Similar content to Build, Deploy And Scale Power Apps", bucket: "FY26 — already removed", replacement: "" },
  { title: "Power BI Embedded Hands On Lab", reason: "Similar content to FAIAD - New content", bucket: "FY26 — already removed", replacement: "" },
  { title: "Azure OpenAI + NLP Using ChatGPT On SQL Engine", reason: "Similar content to Get Started With OpenAI And Build Natural Language Solution", bucket: "FY26 — already removed", replacement: "" },
  { title: "Governance with Power Platform", reason: "Outdated content, deprecated services", bucket: "FY26 — already removed", replacement: "" },
  { title: "Migrating DB From Single Server To Flexible Postgres SQL Server", reason: "Outdated content, deprecated services", bucket: "FY26 — already removed", replacement: "" },
];

export const retirementSummary = {
  totalRemoved: 22,
  fy26Removed: 19,
  fy27Pending: 3,
  note:
    "22 tracks retired in total — 19 in FY26 and 3 in FY27. The 3 FY27 tracks are pending catalog-team approval to retire on schedule.",
};

// ── Section 3: New catalog items proposed for FY27 ──────────────────────────
export const newProposals: NewProposal[] = [
  {
    title: "Unlock Agent Mode for Microsoft 365 Copilot",
    readiness: "LabGuide preview",
    duration: "4 hours",
    link: "https://experience.cloudlabs.ai/#labguidepreview/4d745d4a-d3aa-4f2d-8a92-6c7613ffeee9/1",
  },
  {
    title: "Implement Agent 365 to observe, govern and secure AI apps, Copilot and agents",
    readiness: "LabGuide preview",
    duration: "8 hours",
    link: "https://experience.cloudlabs.ai/#labguidepreview/8e8d1060-5cef-4c05-8bfb-14f4eb0bcc55/1",
  },
  {
    title: "Multi-Agent Orchestration with A2A in Copilot Studio",
    readiness: "LabGuide preview",
    duration: "4 hours",
    link: "https://experience.cloudlabs.ai/#labguidepreview/da7f5954-4b78-45c1-af24-3c096ae6bdce/1",
  },
  {
    title:
      "From Data to Decisions — Building an Intelligent Enterprise with Fabric IQ, Foundry IQ and Work IQ",
    readiness: "LabGuide preview",
    duration: "8 hours",
    link: "https://experience.cloudlabs.ai/#labguidepreview/fa36a9c3-a8ea-4e10-b3d5-8ad4d26ae9a7/1",
  },
  {
    title: "Building with Azure Container Apps Sandboxes",
    readiness: "TOC provided",
    duration: "1 hour",
    link: "https://spektrasystems.sharepoint.com/:w:/s/CloudLabs-Services/IQAn1FjxmyjRSbNHB7477AjEAW1s7PHlaBhcuLEO5UaY9YM?e=xwTyG7",
  },
  {
    title: "Applying Guardrails and Controls in Microsoft Foundry",
    readiness: "TOC provided",
    duration: "1 hour",
    link: "https://spektrasystems.sharepoint.com/:w:/s/CloudLabs-Services/IQBEPMOoB7jcSavnj2r7ZbrOAeceQusGd-ZOw3JWsMlUin8?e=l9CEmB",
  },
  {
    title: "Build Secure Agents for Public Sector Services",
    readiness: "LabGuide preview",
    duration: "1 hour",
    link: "https://experience.cloudlabs.ai/#labguidepreview/57455065-ea09-44ed-972c-ba48c71b49eb/1",
  },
];

// ── Section 4: Closure / sign-off ───────────────────────────────────────────
export const closurePoints: { title: string; detail: string }[] = [
  {
    title: "Updates completed",
    detail:
      "The Top 15 labs have been refreshed and validated, and all lab content has been brought current.",
  },
  {
    title: "Retirements confirmed",
    detail:
      "22 tracks have been retired — 19 in FY26 and 3 in FY27; 3 remain pending catalog-team approval to retire on schedule.",
  },
  {
    title: "New proposals ready",
    detail:
      "Seven new catalog items are proposed for FY27, with LabGuide previews and outlines ready for confirmation.",
  },
  {
    title: "Next steps",
    detail:
      "The refreshed Top 15 set goes live next week. We request sign-off to proceed with the FY27 rollout.",
  },
];

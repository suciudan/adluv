"use client";

import type { ReactNode, SVGProps } from "react";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Plug,
} from "lucide-react";

import { AppButton, PageHeader, cn } from "../../../components/app-ui";

type AgentId = "claude" | "chatgpt" | "codex" | "cursor" | "claude-code" | "gemini" | "other";
type StepId = "choose" | "connect" | "start";
type AgentLogo = (props: SVGProps<SVGSVGElement>) => ReactNode;

const setupSteps: Array<{ id: StepId; label: string }> = [
  { id: "choose", label: "Choose" },
  { id: "connect", label: "Configure" },
  { id: "start", label: "Test" },
];

const hostedMcpUrl = "https://mcp.adluv.co/mcp";

function ClaudeLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z"
        fill="#D97757"
        fillRule="nonzero"
      />
    </svg>
  );
}

function OpenAILogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" fillRule="evenodd" aria-hidden="true" {...props}>
      <path d="M9.205 8.658v-2.26c0-.19.072-.333.238-.428l4.543-2.616c.619-.357 1.356-.523 2.117-.523 2.854 0 4.662 2.212 4.662 4.566 0 .167 0 .357-.024.547l-4.71-2.759a.797.797 0 00-.856 0l-5.97 3.473zm10.609 8.8V12.06c0-.333-.143-.57-.429-.737l-5.97-3.473 1.95-1.118a.433.433 0 01.476 0l4.543 2.617c1.309.76 2.189 2.378 2.189 3.948 0 1.808-1.07 3.473-2.76 4.163zM7.802 12.703l-1.95-1.142c-.167-.095-.239-.238-.239-.428V5.899c0-2.545 1.95-4.472 4.591-4.472 1 0 1.927.333 2.712.928L8.23 5.067c-.285.166-.428.404-.428.737v6.898zM12 15.128l-2.795-1.57v-3.33L12 8.658l2.795 1.57v3.33L12 15.128zm1.796 7.23c-1 0-1.927-.332-2.712-.927l4.686-2.712c.285-.166.428-.404.428-.737v-6.898l1.974 1.142c.167.095.238.238.238.428v5.233c0 2.545-1.974 4.472-4.614 4.472zm-5.637-5.303l-4.544-2.617c-1.308-.761-2.188-2.378-2.188-3.948A4.482 4.482 0 014.21 6.327v5.423c0 .333.143.571.428.738l5.947 3.449-1.95 1.118a.432.432 0 01-.476 0zm-.262 3.9c-2.688 0-4.662-2.021-4.662-4.519 0-.19.024-.38.047-.57l4.686 2.71c.286.167.571.167.856 0l5.97-3.448v2.26c0 .19-.07.333-.237.428l-4.543 2.616c-.619.357-1.356.523-2.117.523zm5.899 2.83a5.947 5.947 0 005.827-4.756C22.287 18.339 24 15.84 24 13.296c0-1.665-.713-3.282-1.998-4.448.119-.5.19-.999.19-1.498 0-3.401-2.759-5.947-5.946-5.947-.642 0-1.26.095-1.88.31A5.962 5.962 0 0010.205 0a5.947 5.947 0 00-5.827 4.757C1.713 5.447 0 7.945 0 10.49c0 1.666.713 3.283 1.998 4.448-.119.5-.19 1-.19 1.499 0 3.401 2.759 5.946 5.946 5.946.642 0 1.26-.095 1.88-.309a5.96 5.96 0 004.162 1.713z" />
    </svg>
  );
}

function CodexLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M19.503 0H4.496A4.496 4.496 0 000 4.496v15.007A4.496 4.496 0 004.496 24h15.007A4.496 4.496 0 0024 19.503V4.496A4.496 4.496 0 0019.503 0z" fill="#fff" />
      <path
        d="M9.064 3.344a4.578 4.578 0 012.285-.312c1 .115 1.891.54 2.673 1.275.01.01.024.017.037.021a.09.09 0 00.043 0 4.55 4.55 0 013.046.275l.047.022.116.057a4.581 4.581 0 012.188 2.399c.209.51.313 1.041.315 1.595a4.24 4.24 0 01-.134 1.223.123.123 0 00.03.115c.594.607.988 1.33 1.183 2.17.289 1.425-.007 2.71-.887 3.854l-.136.166a4.548 4.548 0 01-2.201 1.388.123.123 0 00-.081.076c-.191.551-.383 1.023-.74 1.494-.9 1.187-2.222 1.846-3.711 1.838-1.187-.006-2.239-.44-3.157-1.302a.107.107 0 00-.105-.024c-.388.125-.78.143-1.204.138a4.441 4.441 0 01-1.945-.466 4.544 4.544 0 01-1.61-1.335c-.152-.202-.303-.392-.414-.617a5.81 5.81 0 01-.37-.961 4.582 4.582 0 01-.014-2.298.124.124 0 00.006-.056.085.085 0 00-.027-.048 4.467 4.467 0 01-1.034-1.651 3.896 3.896 0 01-.251-1.192 5.189 5.189 0 01.141-1.6c.337-1.112.982-1.985 1.933-2.618.212-.141.413-.251.601-.33.215-.089.43-.164.646-.227a.098.098 0 00.065-.066 4.51 4.51 0 01.829-1.615 4.535 4.535 0 011.837-1.388zm3.482 10.565a.637.637 0 000 1.272h3.636a.637.637 0 100-1.272h-3.636zM8.462 9.23a.637.637 0 00-1.106.631l1.272 2.224-1.266 2.136a.636.636 0 101.095.649l1.454-2.455a.636.636 0 00.005-.64L8.462 9.23z"
        fill="url(#codex-logo-gradient)"
      />
      <defs>
        <linearGradient id="codex-logo-gradient" x1="12" x2="12" y1="3" y2="21" gradientUnits="userSpaceOnUse">
          <stop stopColor="#B1A7FF" />
          <stop offset=".5" stopColor="#7A9DFF" />
          <stop offset="1" stopColor="#3941FF" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function CursorLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" fillRule="evenodd" aria-hidden="true" {...props}>
      <path d="M22.106 5.68L12.5.135a.998.998 0 00-.998 0L1.893 5.68a.84.84 0 00-.419.726v11.186c0 .3.16.577.42.727l9.607 5.547a.999.999 0 00.998 0l9.608-5.547a.84.84 0 00.42-.727V6.407a.84.84 0 00-.42-.726zm-.603 1.176L12.228 22.92c-.063.108-.228.064-.228-.061V12.34a.59.59 0 00-.295-.51l-9.11-5.26c-.107-.062-.063-.228.062-.228h18.55c.264 0 .428.286.296.514z" />
    </svg>
  );
}

function ClaudeCodeLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" fillRule="evenodd" aria-hidden="true" {...props}>
      <path clipRule="evenodd" d="M20.998 10.949H24v3.102h-3v3.028h-1.487V20H18v-2.921h-1.487V20H15v-2.921H9V20H7.488v-2.921H6V20H4.487v-2.921H3V14.05H0V10.95h3V5h17.998v5.949zM6 10.949h1.488V8.102H6v2.847zm10.51 0H18V8.102h-1.49v2.847z" />
    </svg>
  );
}

function GeminiCliLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" fillRule="evenodd" aria-hidden="true" {...props}>
      <path d="M16.793 10.358v3.867L7.236 18.82v-2.8l7.751-3.728-7.75-3.728V5.763l9.556 4.595z" />
      <path clipRule="evenodd" d="M19.608 0A4.392 4.392 0 0124 4.392v15.216A4.392 4.392 0 0119.608 24H4.392A4.392 4.392 0 010 19.608V4.392A4.392 4.392 0 014.392 0h15.216zM4.26 1.444A2.816 2.816 0 001.444 4.26v15.48a2.816 2.816 0 002.816 2.816h15.48a2.816 2.816 0 002.816-2.816V4.26a2.816 2.816 0 00-2.816-2.816H4.26z" />
    </svg>
  );
}

function McpLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" fillRule="evenodd" aria-hidden="true" {...props}>
      <path d="M15.688 2.343a2.588 2.588 0 00-3.61 0l-9.626 9.44a.863.863 0 01-1.203 0 .823.823 0 010-1.18l9.626-9.44a4.313 4.313 0 016.016 0 4.116 4.116 0 011.204 3.54 4.3 4.3 0 013.609 1.18l.05.05a4.115 4.115 0 010 5.9l-8.706 8.537a.274.274 0 000 .393l1.788 1.754a.823.823 0 010 1.18.863.863 0 01-1.203 0l-1.788-1.753a1.92 1.92 0 010-2.754l8.706-8.538a2.47 2.47 0 000-3.54l-.05-.049a2.588 2.588 0 00-3.607-.003l-7.172 7.034-.002.002-.098.097a.863.863 0 01-1.204 0 .823.823 0 010-1.18l7.273-7.133a2.47 2.47 0 00-.003-3.537z" />
      <path d="M14.485 4.703a.823.823 0 000-1.18.863.863 0 00-1.204 0l-7.119 6.982a4.115 4.115 0 000 5.9 4.314 4.314 0 006.016 0l7.12-6.982a.823.823 0 000-1.18.863.863 0 00-1.204 0l-7.119 6.982a2.588 2.588 0 01-3.61 0 2.47 2.47 0 010-3.54l7.12-6.982z" />
    </svg>
  );
}

const agents: Array<{
  id: AgentId;
  name: string;
  description: string;
  logo: AgentLogo;
  logoClassName: string;
  logoWrapClassName: string;
}> = [
  {
    id: "claude",
    name: "Claude",
    description: "Add Adluv as a remote Claude connector.",
    logo: ClaudeLogo,
    logoClassName: "h-7 w-7",
    logoWrapClassName: "bg-orange-50",
  },
  {
    id: "chatgpt",
    name: "ChatGPT",
    description: "Use the hosted MCP endpoint from ChatGPT.",
    logo: OpenAILogo,
    logoClassName: "h-7 w-7 text-emerald-950",
    logoWrapClassName: "bg-emerald-100",
  },
  {
    id: "codex",
    name: "Codex",
    description: "Connect Codex directly to hosted Adluv tools.",
    logo: CodexLogo,
    logoClassName: "h-7 w-7",
    logoWrapClassName: "bg-slate-950",
  },
  {
    id: "cursor",
    name: "Cursor",
    description: "Add the remote server to your MCP config.",
    logo: CursorLogo,
    logoClassName: "h-7 w-7 text-stone-950",
    logoWrapClassName: "bg-stone-100",
  },
  {
    id: "claude-code",
    name: "Claude Code",
    description: "Use Claude Code's remote HTTP transport.",
    logo: ClaudeCodeLogo,
    logoClassName: "h-7 w-7 text-orange-950",
    logoWrapClassName: "bg-orange-100",
  },
  {
    id: "gemini",
    name: "Gemini CLI",
    description: "Use Adluv from an MCP-capable CLI.",
    logo: GeminiCliLogo,
    logoClassName: "h-7 w-7 text-sky-950",
    logoWrapClassName: "bg-sky-100",
  },
  {
    id: "other",
    name: "Other agent",
    description: "Use any client with remote HTTP MCP support.",
    logo: McpLogo,
    logoClassName: "h-7 w-7 text-violet-950",
    logoWrapClassName: "bg-violet-100",
  },
];

function getConnectionInstructions(agentName: string) {
  if (agentName === "Claude") {
    return [
      {
        title: "Add a custom connector",
        body: "Open Claude's connector settings, choose to add a custom remote connector, and use the hosted Adluv MCP URL.",
        value: `Name: Adluv
Remote MCP server URL: ${hostedMcpUrl}`,
      },
      {
        title: "Connect your account",
        body: "Click Connect for Adluv and complete the Adluv OAuth flow in the browser.",
        value: "Auth: Adluv OAuth",
      },
      {
        title: "Use Adluv in Claude",
        body: "Start a new chat and enable the Adluv connector from Claude's tools or connectors menu.",
        value: "Connector: Adluv",
      },
    ];
  }

  if (agentName === "ChatGPT") {
    return [
      {
        title: "Enable custom apps",
        body: "In ChatGPT, enable developer mode or ask a workspace admin to create and approve a custom MCP app.",
        value: "Settings -> Apps -> Advanced settings -> Developer mode",
      },
      {
        title: "Create the Adluv app",
        body: "Create a custom MCP app or connector and enter the hosted Adluv endpoint.",
        value: `App name: Adluv
MCP server endpoint: ${hostedMcpUrl}
Authentication: OAuth`,
      },
      {
        title: "Connect in ChatGPT",
        body: "Open a new chat, select Adluv from the apps or tools menu, and complete the Adluv OAuth flow if prompted.",
        value: "App: Adluv",
      },
    ];
  }

  if (agentName === "Codex") {
    return [
      {
        title: "Remove any old Adluv server",
        body: "Clear a stale local or incorrectly configured Adluv MCP entry before adding the hosted endpoint.",
        value: "codex mcp remove adluv",
      },
      {
        title: "Add the hosted MCP endpoint",
        body: "Create a remote HTTP MCP server named `adluv`. Codex connects to Adluv over HTTPS; you do not need to install or run an Adluv server locally.",
        value: `codex mcp add adluv --url ${hostedMcpUrl}`,
      },
      {
        title: "Log in with Adluv",
        body: "Start Codex's OAuth flow, then sign in with your Adluv account in the browser.",
        value: "codex mcp login adluv",
      },
    ];
  }

  if (agentName === "Cursor") {
    return [
      {
        title: "Open Cursor MCP config",
        body: "Use Cursor's MCP settings or edit the global MCP config file for tools available across projects.",
        value: "~/.cursor/mcp.json",
      },
      {
        title: "Add the hosted endpoint",
        body: "Add Adluv as a remote MCP server using the hosted HTTPS endpoint.",
        value: getClientSnippet(agentName),
      },
      {
        title: "Authenticate if prompted",
        body: "When Cursor connects to Adluv, complete the OAuth browser flow and allow the tools you want to use.",
        value: "Auth: Adluv OAuth",
      },
    ];
  }

  if (agentName === "Claude Code") {
    return [
      {
        title: "Remove any old Adluv server",
        body: "Clear a stale local or incorrectly configured Adluv MCP entry before adding the hosted endpoint.",
        value: "claude mcp remove adluv",
      },
      {
        title: "Add the hosted endpoint",
        body: "Add Adluv as a user-scoped remote HTTP MCP server so it is available across Claude Code projects.",
        value: `claude mcp add --transport http --scope user adluv ${hostedMcpUrl}`,
      },
      {
        title: "Authenticate in Claude Code",
        body: "Open Claude Code, run the MCP menu command, and complete the Adluv OAuth flow in the browser.",
        value: "/mcp",
      },
    ];
  }

  if (agentName === "Gemini CLI") {
    return [
      {
        title: "Remove any old Adluv server",
        body: "Clear a stale local or incorrectly configured Adluv MCP entry before adding the hosted endpoint.",
        value: "gemini mcp remove adluv",
      },
      {
        title: "Add the hosted endpoint",
        body: "Add Adluv as a user-scoped Streamable HTTP MCP server.",
        value: `gemini mcp add --transport http --scope user adluv ${hostedMcpUrl}`,
      },
      {
        title: "Authenticate in Gemini CLI",
        body: "In a Gemini CLI session, start OAuth for Adluv if it is not already connected.",
        value: "/mcp auth adluv",
      },
    ];
  }

  return [
    {
      title: "Copy the hosted MCP URL",
      body: "This is the Adluv MCP endpoint. Your agent connects to it over HTTPS; you do not need to install or run an Adluv server locally.",
      value: hostedMcpUrl,
    },
    {
      title: `Add Adluv in ${agentName}`,
      body: "Create a remote HTTP MCP server named `adluv` and paste the hosted URL when the client asks for the server address.",
      value: getClientSnippet(agentName),
    },
    {
      title: "Authenticate with Adluv",
      body: "When your client asks for authorization, sign in with your Adluv account. The hosted server scopes tool access to your Adluv user and workspace.",
      value: "Auth: Adluv OAuth",
    },
  ];
}

function getClientSnippet(agentName: string) {
  if (agentName === "Claude Code") {
    return `claude mcp remove adluv
claude mcp add --transport http --scope user adluv ${hostedMcpUrl}
/mcp`;
  }

  if (agentName === "Codex") {
    return `codex mcp remove adluv
codex mcp add adluv --url ${hostedMcpUrl}
codex mcp login adluv`;
  }

  if (agentName === "Claude") {
    return `Name: Adluv
Remote MCP server URL: ${hostedMcpUrl}`;
  }

  if (agentName === "ChatGPT") {
    return `App name: Adluv
MCP server endpoint: ${hostedMcpUrl}
Authentication: OAuth`;
  }

  if (agentName === "Cursor") {
    return `{
  "mcpServers": {
    "adluv": {
      "url": "${hostedMcpUrl}"
    }
  }
}`;
  }

  if (agentName === "Gemini CLI") {
    return `gemini mcp remove adluv
gemini mcp add --transport http --scope user adluv ${hostedMcpUrl}
/mcp auth adluv`;
  }

  return `{
  "mcpServers": {
    "adluv": {
      "type": "http",
      "url": "${hostedMcpUrl}"
    }
  }
}`;
}

function getTestPrompt(agentName: string) {
  return `Use the Adluv MCP server and confirm you can access Adluv tools. If the connection is not ready, tell me what ${agentName} needs next.`;
}

function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      className="app-button app-button-secondary h-9 px-3 text-[13px]"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1800);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? <Check size={15} strokeWidth={1.75} /> : <Copy size={15} strokeWidth={1.75} />}
      {copied ? "Copied" : label}
    </button>
  );
}

function CodeBlock({ value }: { value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] p-3">
      <div className="flex items-start justify-between gap-3">
        <code className="block min-w-0 overflow-x-auto whitespace-pre-wrap break-all text-[13px] leading-6 text-[var(--text-primary)]">
          {value}
        </code>
        <CopyButton value={value} />
      </div>
    </div>
  );
}

export default function SetupMcpPage() {
  const [selectedAgentId, setSelectedAgentId] = useState<AgentId>("claude");
  const [step, setStep] = useState<StepId>("choose");
  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) ?? agents[0];
  const selectedIndex = setupSteps.findIndex((item) => item.id === step);
  const instructions = useMemo(() => getConnectionInstructions(selectedAgent.name), [selectedAgent.name]);
  const testPrompt = useMemo(() => getTestPrompt(selectedAgent.name), [selectedAgent.name]);

  const goNext = () => {
    setStep(setupSteps[Math.min(selectedIndex + 1, setupSteps.length - 1)].id);
  };

  const goBack = () => {
    setStep(setupSteps[Math.max(selectedIndex - 1, 0)].id);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Plug}
        title="Setup MCP"
      />

      <section className="max-w-5xl space-y-8">
        {step === "choose" ? (
          <section className="space-y-4">
            <div>
              <h2 className="text-[24px] font-semibold leading-[30px] text-[var(--text-primary)]">Choose your agent</h2>
              <p className="mt-2 text-[14px] leading-[22px] text-[var(--text-secondary)]">
                Pick the client you want to connect first. Every option uses the same hosted Adluv MCP server.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {agents.map((agent) => {
                const Logo = agent.logo;

                return (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => {
                      setSelectedAgentId(agent.id);
                      setStep("connect");
                    }}
                    className={cn(
                      "app-surface-card relative flex min-h-36 flex-col items-center justify-center p-5 text-center transition",
                      "hover:border-[var(--border-strong)] hover:bg-[var(--bg-surface-3)]",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-14 w-14 items-center justify-center rounded-full transition",
                        agent.logoWrapClassName,
                      )}
                    >
                      <Logo className={agent.logoClassName} />
                    </span>
                    <span className="mt-3 text-[15px] font-semibold leading-5 text-[var(--text-primary)]">{agent.name}</span>
                    <span className="mt-2 text-[12px] leading-5 text-[var(--text-tertiary)]">{agent.description}</span>
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        {step === "connect" ? (
          <section className="space-y-5">
            <div>
              <div>
                <h2 className="text-[24px] font-semibold leading-[30px] text-[var(--text-primary)]">
                  Configure {selectedAgent.name}
                </h2>
                <p className="mt-2 max-w-3xl text-[14px] leading-[22px] text-[var(--text-secondary)]">
                  Add the hosted Adluv MCP server as a remote HTTP endpoint. No local install or background process is
                  required.
                </p>
              </div>
            </div>

            <div className="grid gap-4">
              {instructions.map((instruction, index) => (
                <article
                  key={instruction.title}
                  className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] p-4"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[13px] font-semibold text-[var(--accent-hover)]">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1 space-y-3">
                      <div>
                        <h3 className="text-[15px] font-semibold leading-6 text-[var(--text-primary)]">
                          {instruction.title}
                        </h3>
                        <p className="mt-1 text-[13px] leading-5 text-[var(--text-secondary)]">{instruction.body}</p>
                      </div>
                      <CodeBlock value={instruction.value} />
                    </div>
                  </div>
                </article>
              ))}
            </div>

          </section>
        ) : null}

        {step === "start" ? (
          <section className="space-y-5">
            <div>
              <h2 className="text-[24px] font-semibold leading-[30px] text-[var(--text-primary)]">
                Start with a connection check
              </h2>
              <p className="mt-2 max-w-3xl text-[14px] leading-[22px] text-[var(--text-secondary)]">
                Send this prompt to {selectedAgent.name}. It verifies that the remote MCP server is reachable and
                authenticated before you start research work.
              </p>
            </div>

            <article className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h3 className="text-[15px] font-semibold leading-6 text-[var(--text-primary)]">
                    Prompt for {selectedAgent.name}
                  </h3>
                  <p className="mt-1 text-[13px] leading-5 text-[var(--text-secondary)]">
                    Paste this into a new conversation after the server has been added.
                  </p>
                </div>
                <CopyButton value={testPrompt} label="Copy prompt" />
              </div>
              <div className="mt-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] p-4 text-[14px] leading-6 text-[var(--text-primary)]">
                {testPrompt}
              </div>
            </article>

            <div className="grid gap-4 lg:grid-cols-2">
              <article className="rounded-2xl border border-[rgba(16,185,129,0.28)] bg-[rgba(16,185,129,0.08)] p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 size={20} strokeWidth={1.75} className="mt-0.5 text-emerald-300" />
                  <div>
                    <h3 className="text-[15px] font-semibold leading-6 text-[var(--text-primary)]">
                      What ready looks like
                    </h3>
                    <p className="mt-1 text-[13px] leading-5 text-[var(--text-secondary)]">
                      {selectedAgent.name} should say it can see Adluv tools or list the available Adluv actions.
                    </p>
                  </div>
                </div>
              </article>

              <article className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] p-4">
                <div className="flex items-start gap-3">
                  <ExternalLink size={20} strokeWidth={1.75} className="mt-0.5 text-[var(--accent-hover)]" />
                  <div>
                    <h3 className="text-[15px] font-semibold leading-6 text-[var(--text-primary)]">Having issues?</h3>
                    <p className="mt-1 text-[13px] leading-5 text-[var(--text-secondary)]">
                      Reconnect the Adluv server in your MCP client. If this is a managed workspace, ask an admin to
                      approve the Adluv connector first.
                    </p>
                  </div>
                </div>
              </article>
            </div>
          </section>
        ) : null}

        {step !== "choose" ? (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] p-3 shadow-[var(--shadow-card)]">
            <AppButton type="button" variant="secondary" onClick={goBack}>
              <ArrowLeft size={16} strokeWidth={1.75} />
              Back
            </AppButton>
            <div />
            <AppButton type="button" variant="primary" onClick={goNext} disabled={selectedIndex === setupSteps.length - 1}>
              Continue
              <ArrowRight size={16} strokeWidth={1.75} />
            </AppButton>
          </div>
        ) : null}
      </section>
    </div>
  );
}

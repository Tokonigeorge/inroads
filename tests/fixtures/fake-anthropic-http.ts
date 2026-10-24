/**
 * The fake Anthropic API for end-to-end tests: answers POST /v1/messages (streaming or not)
 * with canned replies picked from the prompt. Served by tests/e2e/support/fake-supabase.ts.
 */
import type { ServerResponse } from "node:http";
import { parseQuickCapture } from "../../src/domain/quick-capture";
import { fakeMessage, promptText, type FakeReply, type FakeRequest } from "./fake-anthropic";

const uuids = (s: string) => [...new Set(s.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g) ?? [])];

/** Quick capture: answer like a careful model would, using the rules parser on the line. */
function captureReply(p: string): FakeReply {
  const today = /Today is \w+ (\d{4}-\d{2}-\d{2})/.exec(p)?.[1] ?? new Date().toISOString().slice(0, 10);
  const d = parseQuickCapture(p.split("THE LINE:\n")[1] ?? "", today);
  return {
    json: {
      name: d.name ?? "",
      company: d.company ?? "",
      position: d.position ?? "",
      touched: Boolean(d.touch),
      touchType: d.touch?.type ?? "other",
      touchDate: d.touch?.occurredOn ?? "",
      promises: d.promises.map((x) => ({ text: x.text, owner: x.owner, due: x.dueOn ?? "" })),
      followUpDate: d.followUpOn ?? "",
    },
  };
}

export function e2eReply(req: FakeRequest): FakeReply {
  const p = promptText(req);
  if (p.includes("I jotted down one line")) return captureReply(p);
  if (p.includes("relationship-intelligence researcher")) {
    return {
      searches: [{ query: "Adaeze Okafor Kestrel Ventures", results: [{ title: "Adaeze Okafor | Kestrel", url: "https://kestrel.example/team/adaeze" }] }],
      json: {
        identity: "Adaeze Okafor, Partner at Kestrel Ventures in Lagos",
        matched: ["Company and role match the Kestrel team page"],
        conflicts: [],
        summary: "Early-stage investor focused on West African fintech.",
        career: ["Partner, Kestrel Ventures"],
        company: "Kestrel Ventures backs seed-stage startups",
        signals: ["Spoke at Lagos Startup Week (Oct 2026)"],
        sharedInterests: ["Payments infrastructure"],
        talkingPoints: ["Ask how Kestrel thinks about B2B payments"],
        opportunities: ["Pitch the pre-seed round"],
        profiles: { linkedin: "", x: "https://x.com/adaeze", instagram: "", github: "", substack: "", website: "" },
        found: { position: "Partner", company: "Kestrel Ventures", city: "Lagos", birthday: "" },
        score: 86,
        scoreWhy: "Invests at your stage",
        goalId: uuids(p.split("Goals in this Space:")[1] ?? "")[0] ?? "",
        confidence: "high",
        caveats: "",
        sources: [{ title: "Kestrel team", url: "https://kestrel.example/team/adaeze" }],
      },
    };
  }
  if (p.includes("Help me get to know someone")) {
    return { json: { identity: "Same person", sharedInterests: [{ text: "Afrobeats", url: "" }], thingsToAsk: [{ text: "Which gig was the best this year?", url: "" }], funFacts: [], confidence: "medium", caveats: "", sources: [] } };
  }
  if (p.includes("Help me check that someone")) return { json: { answer: "yes", summary: "The profile exists and matches.", redFlags: [], sources: [] } };
  if (p.includes("Write a short")) return { text: "Hi! It was great to catch up at the breakfast. Shall we pick up the pricing chat next week?" };
  if (p.includes("morning networking brief")) return { text: "## Today's rooms\n- Pricing review: remember the deck you owe.\n## One move for my goals\n- Follow up with **Adaeze**." };
  if (p.includes("weekly networking digest")) return { text: "## This week's three moves\n- Book coffee with Kwame." };
  if (p.includes("Find real networking events")) {
    return {
      json: {
        items: [{ title: "Fintech Founders Mixer", kind: "mixer", date: "", time: "18:00", timing: "First Thursday monthly", where: "Victoria Island", why: "Investors attend", who: "Seed investors", url: "https://events.example/mixer", howToFind: "Check the listing", confidence: "recurring" }],
        sources: [],
      },
    };
  }
  if (p.includes("You map the landscape")) {
    const network = p.split("MY NETWORK IN THIS SPACE")[1] ?? "";
    return { json: { title: "Kestrel Ventures", kind: "company", overview: "A seed fund in Lagos.", facts: ["Founded 2019"], website: "https://kestrel.example", stakeholders: [{ name: "Adaeze Okafor", role: "Partner", why: "Leads fintech deals", url: "" }], warmPaths: uuids(network).slice(0, 1).map((id) => ({ contactId: id, how: "Works there", angle: "Ask for 20 minutes" })), opportunities: [], playbook: ["Lead with traction"], confidence: "high", verify: "", sources: [] } };
  }
  if (p.includes("Score how valuable")) {
    const goal = uuids(p.split("Goals in this Space:")[1]?.split("CONTACTS")[0] ?? "")[0] ?? "";
    return { json: { scores: uuids(p.split("CONTACTS")[1] ?? "").map((id) => ({ id, score: 72, why: "Relevant to the round", goalId: goal })) } };
  }
  if (p.includes("Extract relationship intelligence")) {
    return { json: { summary: "Friendly; agreed to meet.", lastDate: "", interactions: [{ date: "", summary: "Agreed to meet for coffee" }], commitments: [{ text: "Send the pitch deck", owner: "me", due: "" }], details: { company: "", position: "", interests: ["Afrobeats"], birthday: "" }, sentiment: "warm", nextStep: "" } };
  }
  if (p.includes("business card")) return { json: { name: "Ngozi Eze", position: "Head of Growth", company: "Flutterwave", email: "ngozi@flutterwave.example", phone: "0803 555 0101", website: "", linkedin: "", x: "", instagram: "", notes: "" } };
  return { text: "OK" };
}

const sse = (res: ServerResponse, event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

export function handleFakeAnthropic(body: string, res: ServerResponse) {
  const req = JSON.parse(body) as FakeRequest & { stream?: boolean };
  const msg = fakeMessage(req, e2eReply(req));
  if (!req.stream) {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify(msg));
  }
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
  sse(res, "message_start", { type: "message_start", message: { ...msg, content: [], stop_reason: null, usage: { ...msg.usage, output_tokens: 1 } } });
  msg.content.forEach((block, index) => {
    if (block.type === "text") {
      sse(res, "content_block_start", { type: "content_block_start", index, content_block: { type: "text", text: "", citations: null } });
      sse(res, "content_block_delta", { type: "content_block_delta", index, delta: { type: "text_delta", text: block.text } });
    } else if (block.type === "server_tool_use") {
      sse(res, "content_block_start", { type: "content_block_start", index, content_block: { ...block, input: {} } });
      sse(res, "content_block_delta", { type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: JSON.stringify(block.input) } });
    } else {
      sse(res, "content_block_start", { type: "content_block_start", index, content_block: block });
    }
    sse(res, "content_block_stop", { type: "content_block_stop", index });
  });
  sse(res, "message_delta", { type: "message_delta", delta: { stop_reason: msg.stop_reason, stop_sequence: null, stop_details: null }, usage: msg.usage });
  sse(res, "message_stop", { type: "message_stop" });
  res.end();
}

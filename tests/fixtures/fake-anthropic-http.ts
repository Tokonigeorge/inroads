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

/** Ask your network: widen to the question's own words, then rank people who mention "fintech" first. */
function askRankReply(p: string): FakeReply {
  const people = JSON.parse(p.split("PEOPLE (JSON):\n")[1] ?? "[]") as { id: string; name: string; notes?: string; interests?: string[] }[];
  const fits = people.filter((x) => JSON.stringify(x).toLowerCase().includes("fintech"));
  return { json: { matches: fits.map((x) => ({ id: x.id, why: `Your notes on ${x.name.split(" ")[0]} mention fintech${x.notes ? `: ${x.notes}` : ""}` })) } };
}

export function e2eReply(req: FakeRequest): FakeReply {
  const p = promptText(req);
  if (p.includes("I'm searching my own contacts")) return { json: { terms: ["fintech", "payments", "accra"] } };
  if (p.includes("I asked a question about my own network")) return askRankReply(p);
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
  // Radar: "Find real networking events" with the web, "Recommend networking rooms" without it.
  if (p.includes("Find real networking events") || p.includes("Recommend networking rooms")) {
    return {
      json: {
        items: [{ title: "Fintech Founders Mixer", kind: "mixer", date: "", time: "18:00", timing: "First Thursday monthly", where: "Victoria Island", why: "Investors attend", who: "Seed investors", url: "https://events.example/mixer", howToFind: "Check the listing", confidence: "recurring" }],
        sources: [],
      },
    };
  }
  if (p.includes("You map the landscape") && p.includes("TARGET (event):")) return eventReply(p);
  if (p.includes("You map the landscape")) {
    const network = p.split("MY NETWORK IN THIS SPACE")[1] ?? "";
    return { json: { title: "Kestrel Ventures", kind: "company", overview: "A seed fund in Lagos.", facts: ["Founded 2019"], website: "https://kestrel.example", stakeholders: [{ name: "Adaeze Okafor", role: "Partner", why: "Leads fintech deals", url: "" }], warmPaths: uuids(network).slice(0, 1).map((id) => ({ contactId: id, how: "Works there", angle: "Ask for 20 minutes" })), opportunities: [], playbook: ["Lead with traction"], confidence: "high", verify: "", sources: [] } };
  }
  if (p.includes("one of my next steps is to find the right people")) {
    return {
      json: {
        people: [
          { name: "Amaka Obi", role: "Investor relations lead", organisation: "Lagos Angel Network", why: "Runs the investor lounge list for Lagos fintech events", url: "https://lan.example/team/amaka" },
          { name: "Seyi Lawal", role: "Head of community", organisation: "Ventures Platform", why: "Curates investor introductions for founders", url: "" },
        ],
        caveats: "Check they're still in these roles.",
        sources: [{ title: "Lagos Angel Network team", url: "https://lan.example/team" }],
      },
    };
  }
  if (p.includes("Score how valuable")) {
    const goal = uuids(p.split("Goals in this Space:")[1]?.split("CONTACTS")[0] ?? "")[0] ?? "";
    return { json: { scores: uuids(p.split("CONTACTS")[1] ?? "").map((id) => ({ id, score: 72, why: "Relevant to the round", goalId: goal })) } };
  }
  if (p.includes("Extract relationship intelligence")) {
    return { json: { summary: "Friendly; agreed to meet.", lastDate: "", interactions: [{ date: "", summary: "Agreed to meet for coffee" }], commitments: [{ text: "Send the pitch deck", owner: "me", due: "" }], details: { company: "", position: "", interests: ["Afrobeats"], birthday: "", other: ["Moving to Accra in the new year"] }, sentiment: "warm", nextStep: "" } };
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

/** An event look-up: "Moonshot" gets a full plan with dates; any other room an empty one (so room tests stay quiet). */
function eventReply(p: string): FakeReply {
  const q = p.split("TARGET (event):")[1]?.split("\n")[0]?.trim() ?? "";
  const today = /Today is (\d{4}-\d{2}-\d{2})/.exec(p)?.[1] ?? "2026-10-25";
  const day = (n: number) => new Date(Date.parse(`${today}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  const empty = { startsOn: "", endsOn: "", startTime: "", endTime: "", timezone: "", venue: "", url: "" };
  if (!/moonshot/i.test(q)) {
    return { json: { title: q, kind: "event", overview: "", facts: [], website: "", stakeholders: [], warmPaths: [], opportunities: [], playbook: [], when: empty, confidence: "low", verify: "", sources: [] } };
  }
  return {
    json: {
      title: "Moonshot by TechCabal",
      kind: "event",
      overview: "Two days of Africa's tech founders and investors in Lagos.",
      facts: ["Around 3,000 attendees"],
      website: "https://moonshot.example",
      stakeholders: [
        { name: "Tunde Bakare", role: "Partner at Kestrel, panel speaker", why: "Writes pre-seed cheques in fintech", url: "https://www.linkedin.com/in/tunde-bakare" },
        { name: "", role: "Investor relations lead", why: "Runs the investor lounge list", url: "" },
        { name: "Bisi Adeyemi", role: "Angel investor", why: "Backs first-time fintech founders", url: "" },
      ],
      warmPaths: [],
      opportunities: [{ goal: "Raise a pre-seed round", idea: "Investor office hours on day two", firstMove: "Book an office-hours slot with Kestrel" }],
      playbook: ["Go to the morning keynote; investors cluster there"],
      when: { startsOn: day(10), endsOn: day(11), startTime: "09:00", endTime: "17:00", timezone: "Africa/Lagos", venue: "Landmark Centre, Lagos", url: "https://moonshot.example/tickets" },
      confidence: "high",
      verify: "",
      sources: [{ title: "Moonshot", url: "https://moonshot.example" }],
    },
  };
}

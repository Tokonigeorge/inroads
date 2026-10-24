import { providerLabels, type ProviderKind } from "@/contracts/connections";

/** Plain words for the ?error= codes the OAuth routes redirect back with. */
export function errorNotice(error: string | undefined, provider: string | undefined) {
  const name = providerLabels[(provider as ProviderKind) ?? "google"]?.name ?? "That account";
  switch (error) {
    case undefined:
      return null;
    case "not_configured":
      return `Connecting ${name} isn't set up on this server yet.`;
    case "denied":
      return `You didn't give access, so nothing from ${name} was connected.`;
    case "state":
      return "That sign-in took too long or was opened twice. Try connecting again.";
    case "no_space":
      return "Create a Space first, then connect.";
    case "share_too_big":
      return "That file is more than 4 MB. Share fewer contacts at a time, or upload the file here.";
    case "share_unreadable":
      return "No contacts or calendar events were found in what you shared.";
    default:
      return `${name} didn't let us connect. Try again in a moment.`;
  }
}

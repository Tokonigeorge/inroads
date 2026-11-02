"use client";

import ForceGraph2D from "react-force-graph-2d";
import type { ComponentProps, Ref } from "react";

/** The force graph, loaded in the browser only (see network-map.tsx); `graphRef` reaches its methods. */
export default function GraphCanvas({ graphRef, ...props }: Record<string, unknown> & { graphRef?: Ref<unknown> }) {
  return <ForceGraph2D ref={graphRef as never} {...(props as unknown as ComponentProps<typeof ForceGraph2D>)} />;
}

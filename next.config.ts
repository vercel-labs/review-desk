import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@chat-adapter/slack", "@slack/socket-mode"],
};

export default withWorkflow(nextConfig);

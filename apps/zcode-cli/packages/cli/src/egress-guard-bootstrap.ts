// Must stay the first import of main.ts: installs the China egress block before any module
// can open a connection. Spec: specs/self-hosted-build/remote-updates-and-litellm.md §6.
import { installChinaEgressGuard } from "@zcode/shared/node";

installChinaEgressGuard();

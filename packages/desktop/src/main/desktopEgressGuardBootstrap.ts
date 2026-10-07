// China egress block for the Electron main process and every Electron session
// (renderer, webviews, Electron net). Imported right after the early data-dir bootstrap,
// before crash capture, ARMS or any service module. Spec:
// specs/self-hosted-build/remote-updates-and-litellm.md §6.
import { app, session, type Session } from "electron";
import { isChinaEgressBlockedUrl } from "@zcode/shared";
import { installChinaEgressGuard } from "@zcode/shared/node";

installChinaEgressGuard();

const guardedSessions = new WeakSet<Session>();

function guardSession(target: Session): void {
  if (guardedSessions.has(target)) return;
  guardedSessions.add(target);
  // No URL filter: the listener sees every request, and only blocked hosts are cancelled.
  target.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: isChinaEgressBlockedUrl(details.url) });
  });
}

app.on("session-created", guardSession);
void app.whenReady().then(() => guardSession(session.defaultSession));

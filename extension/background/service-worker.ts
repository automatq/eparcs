import type { ExtensionMessage, ExtractedLead } from "../lib/types";

// Store extracted leads in memory for the popup/sidepanel to read
let currentLeads: ExtractedLead[] = [];
let currentSiteType: string = "unknown";

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse) => {
    switch (message.type) {
      case "LEAD_EXTRACTED":
        currentLeads = message.payload.leads;
        currentSiteType = message.payload.siteType;
        // Update badge to show lead count
        chrome.action.setBadgeText({
          text: currentLeads.length > 0 ? String(currentLeads.length) : "",
        });
        chrome.action.setBadgeBackgroundColor({ color: "#d4af37" });
        break;

      case "SAVE_LEAD":
        // Forward to the API via the api-client
        saveLead(message.payload).then(
          (result) => sendResponse({ success: true, data: result }),
          (error) => sendResponse({ success: false, error: error.message })
        );
        return true; // Keep channel open for async response

      case "OPEN_SIDEPANEL":
        chrome.sidePanel.open({ windowId: _sender.tab?.windowId });
        break;
    }
  }
);

// Provide current leads to popup/sidepanel
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "GET_CURRENT_LEADS") {
    sendResponse({ leads: currentLeads, siteType: currentSiteType });
  }
});

// Clear leads when tab changes
chrome.tabs.onActivated.addListener(() => {
  currentLeads = [];
  currentSiteType = "unknown";
  chrome.action.setBadgeText({ text: "" });
});

async function saveLead(lead: ExtractedLead) {
  const token = (await chrome.storage.session.get("authToken")).authToken;
  const apiBase =
    (await chrome.storage.local.get("apiBase")).apiBase ||
    "http://localhost:3000";

  const response = await fetch(`${apiBase}/api/leads`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(lead),
  });

  if (!response.ok) {
    throw new Error(`Failed to save lead: ${response.status}`);
  }

  return response.json();
}

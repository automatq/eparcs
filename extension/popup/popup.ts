interface LeadData {
  name?: string;
  company?: string;
  title?: string;
  location?: string;
  phone?: string;
  website?: string;
  rating?: number;
  reviewCount?: number;
  category?: string;
  jobTitle?: string;
  signalStrength?: string;
  source: string;
  leadType: string;
}

function renderLeadCard(lead: LeadData, index: number): string {
  const sourceClass = `source-${lead.source}`;
  const sourceLabel =
    lead.source === "linkedin"
      ? "LinkedIn"
      : lead.source === "gmaps"
      ? "Google Maps"
      : "Job Board";

  let details = "";
  if (lead.source === "linkedin") {
    if (lead.title) details += `<div class="lead-detail">${lead.title}</div>`;
    if (lead.company)
      details += `<div class="lead-detail">${lead.company}</div>`;
    if (lead.location)
      details += `<div class="lead-detail">${lead.location}</div>`;
  } else if (lead.source === "gmaps") {
    if (lead.category)
      details += `<div class="lead-detail">${lead.category}</div>`;
    if (lead.rating)
      details += `<div class="lead-detail">${lead.rating} stars (${lead.reviewCount ?? 0} reviews)</div>`;
    if (lead.phone)
      details += `<div class="lead-detail">${lead.phone}</div>`;
  } else if (lead.source === "jobboard") {
    details += `<div class="lead-detail">${lead.jobTitle ?? ""}</div>`;
    details += `<div class="lead-detail">${lead.company ?? ""}</div>`;
    if (lead.signalStrength) {
      details += `<span class="signal-badge signal-${lead.signalStrength}">Automation signal: ${lead.signalStrength}</span>`;
    }
  }

  return `
    <div class="lead-card" data-index="${index}">
      <div class="lead-name">${lead.name ?? lead.company ?? "Unknown"}</div>
      ${details}
      <span class="lead-source ${sourceClass}">${sourceLabel}</span>
      <div class="actions">
        <button class="btn btn-primary" data-action="save" data-index="${index}">Save Lead</button>
        <button class="btn btn-secondary" data-action="draft" data-index="${index}">AI Draft</button>
      </div>
    </div>
  `;
}

function init() {
  chrome.runtime.sendMessage(
    { type: "GET_CURRENT_LEADS" },
    (response: { leads: LeadData[]; siteType: string }) => {
      const content = document.getElementById("content")!;
      const count = document.getElementById("count")!;

      if (!response?.leads?.length) {
        count.textContent = "0";
        return;
      }

      count.textContent = String(response.leads.length);
      content.innerHTML = `<div class="lead-list">${response.leads
        .map((lead, i) => renderLeadCard(lead, i))
        .join("")}</div>`;

      // Handle button clicks
      content.addEventListener("click", (e) => {
        const btn = (e.target as HTMLElement).closest("[data-action]") as HTMLElement | null;
        if (!btn) return;

        const action = btn.dataset.action;
        const index = parseInt(btn.dataset.index ?? "0");
        const lead = response.leads[index];
        const status = document.getElementById("status")!;

        if (action === "save") {
          btn.textContent = "Saving...";
          chrome.runtime.sendMessage(
            { type: "SAVE_LEAD", payload: lead },
            (result: { success: boolean; error?: string }) => {
              if (result?.success) {
                btn.textContent = "Saved!";
                status.innerHTML = '<div class="status">Lead saved successfully</div>';
              } else {
                btn.textContent = "Save Lead";
                status.innerHTML = `<div class="status error">${result?.error ?? "Failed to save"}</div>`;
              }
            }
          );
        } else if (action === "draft") {
          // First save, then open sidepanel for AI draft
          chrome.runtime.sendMessage({ type: "OPEN_SIDEPANEL" });
        }
      });
    }
  );
}

document.addEventListener("DOMContentLoaded", init);

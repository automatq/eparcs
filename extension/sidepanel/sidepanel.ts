let currentLeads: any[] = [];
let selectedChannel = "email";
let currentDraft = "";

// Tab switching
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    const tabName = (tab as HTMLElement).dataset.tab;
    document.getElementById("lead-tab")!.style.display =
      tabName === "lead" ? "block" : "none";
    document.getElementById("outreach-tab")!.style.display =
      tabName === "outreach" ? "block" : "none";
  });
});

// Channel selection
document.querySelectorAll(".channel-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".channel-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    selectedChannel = (btn as HTMLElement).dataset.channel!;
  });
});

// Load current leads
function loadLeads() {
  chrome.runtime.sendMessage(
    { type: "GET_CURRENT_LEADS" },
    (response: { leads: any[]; siteType: string }) => {
      const content = document.getElementById("lead-content")!;
      if (!response?.leads?.length) return;

      currentLeads = response.leads;
      content.innerHTML = response.leads
        .map((lead: any, i: number) => renderLeadDetail(lead, i))
        .join("");
    }
  );
}

function renderLeadDetail(lead: any, index: number): string {
  const fields: string[] = [];

  const addField = (label: string, value: string | null | undefined) => {
    if (value) {
      fields.push(
        `<div class="field"><div class="field-label">${label}</div><div class="field-value">${value}</div></div>`
      );
    }
  };

  if (lead.source === "linkedin") {
    addField("Name", lead.name);
    addField("Title", lead.title);
    addField("Company", lead.company);
    addField("Location", lead.location);
  } else if (lead.source === "gmaps") {
    addField("Business", lead.name);
    addField("Category", lead.category);
    addField("Rating", lead.rating ? `${lead.rating} (${lead.reviewCount} reviews)` : null);
    addField("Phone", lead.phone);
    addField("Website", lead.website);
    addField("Address", lead.address);
  } else if (lead.source === "jobboard") {
    addField("Company", lead.company);
    addField("Job Title", lead.jobTitle);
    addField("Signal Strength", lead.signalStrength);
  }

  return `
    <div class="card">
      ${fields.join("")}
      <button class="btn btn-primary" onclick="saveLead(${index})">Save Lead</button>
    </div>
  `;
}

// Save lead
(window as any).saveLead = function (index: number) {
  const lead = currentLeads[index];
  chrome.runtime.sendMessage(
    { type: "SAVE_LEAD", payload: lead },
    (result: { success: boolean; error?: string }) => {
      if (result?.success) {
        const btn = document.querySelectorAll(".btn-primary")[index];
        if (btn) btn.textContent = "Saved!";
      }
    }
  );
};

// Generate AI draft
document.getElementById("generate-btn")?.addEventListener("click", async () => {
  const draftContent = document.getElementById("draft-content")!;
  draftContent.innerHTML = '<div class="loading"><div class="spinner"></div><br>Generating draft...</div>';

  // This would call the API to generate a draft
  // For now, show a placeholder
  try {
    const token = (await chrome.storage.session.get("authToken")).authToken;
    const apiBase =
      (await chrome.storage.local.get("apiBase")).apiBase || "http://localhost:3000";

    const response = await fetch(`${apiBase}/api/ai/draft`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        lead: currentLeads[0],
        channel: selectedChannel,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      currentDraft = data.content;
      draftContent.innerHTML = `<textarea id="draft-text">${currentDraft}</textarea>`;
      document.getElementById("copy-btn")!.style.display = "block";
      document.getElementById("approve-btn")!.style.display = "block";
    } else {
      draftContent.innerHTML = '<div class="loading">Failed to generate draft. Make sure you\'re logged in.</div>';
    }
  } catch {
    draftContent.innerHTML = '<div class="loading">Could not connect to server. Is it running?</div>';
  }
});

// Copy to clipboard
document.getElementById("copy-btn")?.addEventListener("click", () => {
  const textarea = document.getElementById("draft-text") as HTMLTextAreaElement;
  const text = textarea?.value ?? currentDraft;
  navigator.clipboard.writeText(text);
  const btn = document.getElementById("copy-btn")!;
  btn.textContent = "Copied!";
  setTimeout(() => (btn.textContent = "Copy to Clipboard"), 2000);
});

// Load on init
loadLeads();

// Re-load when leads change
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "LEAD_EXTRACTED") {
    loadLeads();
  }
});

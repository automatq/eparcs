(()=>{function l(t,n){let a=`source-${t.source}`,s=t.source==="linkedin"?"LinkedIn":t.source==="gmaps"?"Google Maps":"Job Board",e="";return t.source==="linkedin"?(t.title&&(e+=`<div class="lead-detail">${t.title}</div>`),t.company&&(e+=`<div class="lead-detail">${t.company}</div>`),t.location&&(e+=`<div class="lead-detail">${t.location}</div>`)):t.source==="gmaps"?(t.category&&(e+=`<div class="lead-detail">${t.category}</div>`),t.rating&&(e+=`<div class="lead-detail">${t.rating} stars (${t.reviewCount??0} reviews)</div>`),t.phone&&(e+=`<div class="lead-detail">${t.phone}</div>`)):t.source==="jobboard"&&(e+=`<div class="lead-detail">${t.jobTitle??""}</div>`,e+=`<div class="lead-detail">${t.company??""}</div>`,t.signalStrength&&(e+=`<span class="signal-badge signal-${t.signalStrength}">Automation signal: ${t.signalStrength}</span>`)),`
    <div class="lead-card" data-index="${n}">
      <div class="lead-name">${t.name??t.company??"Unknown"}</div>
      ${e}
      <span class="lead-source ${a}">${s}</span>
      <div class="actions">
        <button class="btn btn-primary" data-action="save" data-index="${n}">Save Lead</button>
        <button class="btn btn-secondary" data-action="draft" data-index="${n}">AI Draft</button>
      </div>
    </div>
  `}function g(){chrome.runtime.sendMessage({type:"GET_CURRENT_LEADS"},t=>{let n=document.getElementById("content"),a=document.getElementById("count");if(!t?.leads?.length){a.textContent="0";return}a.textContent=String(t.leads.length),n.innerHTML=`<div class="lead-list">${t.leads.map((s,e)=>l(s,e)).join("")}</div>`,n.addEventListener("click",s=>{let e=s.target.closest("[data-action]");if(!e)return;let i=e.dataset.action,c=parseInt(e.dataset.index??"0"),r=t.leads[c],o=document.getElementById("status");i==="save"?(e.textContent="Saving...",chrome.runtime.sendMessage({type:"SAVE_LEAD",payload:r},d=>{d?.success?(e.textContent="Saved!",o.innerHTML='<div class="status">Lead saved successfully</div>'):(e.textContent="Save Lead",o.innerHTML=`<div class="status error">${d?.error??"Failed to save"}</div>`)})):i==="draft"&&chrome.runtime.sendMessage({type:"OPEN_SIDEPANEL"})})})}document.addEventListener("DOMContentLoaded",g);})();

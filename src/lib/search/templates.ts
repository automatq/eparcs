/**
 * Use Case Templates
 *
 * Pre-built search queries that users can click to instantly run.
 * Modeled after Origami.chat's 13+ use case templates.
 */

export interface SearchTemplate {
  id: string;
  category: string;
  name: string;
  description: string;
  query: string;
  icon: string; // Lucide icon name
}

export const SEARCH_TEMPLATES: SearchTemplate[] = [
  // ── Local Services ──
  {
    id: "hvac-bad-reviews",
    category: "Local Services",
    name: "HVAC companies with bad reviews",
    description: "Find HVAC businesses struggling with customer satisfaction — prime for service improvement",
    query: "Find HVAC and heating/cooling companies with less than 4 stars on Google Maps in [location]",
    icon: "Wrench",
  },
  {
    id: "dentists-no-website",
    category: "Local Services",
    name: "Dentists without websites",
    description: "Dental offices missing online presence — easy web design/marketing upsell",
    query: "Find dental offices and dentist clinics with no website on Google Maps in [location]",
    icon: "Stethoscope",
  },
  {
    id: "restaurants-no-ordering",
    category: "Local Services",
    name: "Restaurants needing online ordering",
    description: "Restaurants with great reviews but no website — need online ordering setup",
    query: "Find restaurants with 50+ reviews but no website on Google Maps in [location]",
    icon: "UtensilsCrossed",
  },
  {
    id: "plumbers-bad-reviews",
    category: "Local Services",
    name: "Plumbers with bad reviews",
    description: "Plumbing companies with reputation issues — opportunity for review management",
    query: "Find plumbing companies with less than 3.5 stars and 10+ reviews in [location]",
    icon: "Droplets",
  },
  {
    id: "salons-high-reviews",
    category: "Local Services",
    name: "Top-rated salons without tech",
    description: "Successful salons that could benefit from booking software or marketing",
    query: "Find hair salons and beauty salons with 4.5+ stars and 100+ reviews but no website in [location]",
    icon: "Scissors",
  },

  // ── Growth Signals ──
  {
    id: "companies-hiring",
    category: "Growth Signals",
    name: "Companies actively hiring",
    description: "Businesses posting data entry or support jobs — likely need automation",
    query: "Find companies posting data entry or customer support jobs in [industry] in [location]",
    icon: "TrendingUp",
  },
  {
    id: "great-reviews-no-tech",
    category: "Growth Signals",
    name: "Great reviews, no tech stack",
    description: "Thriving businesses that haven't invested in technology yet",
    query: "Find businesses with 4.5+ stars and 100+ reviews but basic or no website in [location]",
    icon: "Star",
  },
  {
    id: "new-businesses",
    category: "Growth Signals",
    name: "New businesses with few reviews",
    description: "Recently opened businesses that need marketing and reviews",
    query: "Find businesses with fewer than 10 reviews that opened recently in [location]",
    icon: "Sparkles",
  },

  // ── SaaS / Tech ──
  {
    id: "startup-founders",
    category: "SaaS & Tech",
    name: "Startup founders on LinkedIn",
    description: "Find decision makers at early-stage companies",
    query: "Find founders and CEOs at startups with 10-50 employees in [industry]",
    icon: "Rocket",
  },
  {
    id: "vp-engineering",
    category: "SaaS & Tech",
    name: "VPs of Engineering hiring",
    description: "Engineering leaders at growing companies — likely evaluating tools",
    query: "Find VPs of Engineering and CTOs at companies actively hiring developers in [location]",
    icon: "Code",
  },

  // ── Agency Prospecting ──
  {
    id: "businesses-bad-marketing",
    category: "Agency",
    name: "Businesses needing marketing",
    description: "Local businesses with mediocre reviews that need marketing help",
    query: "Find local businesses with 3-4 star ratings and fewer than 20 reviews in [location]",
    icon: "Megaphone",
  },
  {
    id: "ecommerce-struggling",
    category: "Agency",
    name: "E-commerce stores struggling",
    description: "Online stores that might need better marketing or conversion optimization",
    query: "Find e-commerce and online retail businesses with poor Google reviews in [location]",
    icon: "ShoppingCart",
  },

  // ── Healthcare ──
  {
    id: "medical-practices",
    category: "Healthcare",
    name: "Medical practices needing patients",
    description: "Healthcare providers with low review counts — need patient acquisition",
    query: "Find medical offices, clinics, and healthcare practices with fewer than 30 reviews in [location]",
    icon: "Heart",
  },
  {
    id: "chiropractors-low-ratings",
    category: "Healthcare",
    name: "Chiropractors with low ratings",
    description: "Chiropractic offices struggling with reputation",
    query: "Find chiropractors and chiropractic clinics with less than 4 stars in [location]",
    icon: "Activity",
  },

  // ── Real Estate ──
  {
    id: "real-estate-agents",
    category: "Real Estate",
    name: "Real estate agents on LinkedIn",
    description: "Find realtors and brokers for partnerships or services",
    query: "Find real estate agents and brokers on LinkedIn in [location]",
    icon: "Home",
  },
];

export const TEMPLATE_CATEGORIES = [
  ...new Set(SEARCH_TEMPLATES.map((t) => t.category)),
];

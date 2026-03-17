import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import {
  Bot,
  Zap,
  Phone,
  Mail,
  Video,
  BarChart3,
  Search,
  Users,
  Target,
  ArrowRight,
} from "lucide-react";

export default async function Home() {
  const { userId } = await auth();
  if (userId) redirect("/leads");

  return (
    <div className="min-h-screen bg-background grid-bg">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
            <Search className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="text-lg font-semibold tracking-tight">Scraped</span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/sign-in"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Sign In
          </Link>
          <Link
            href="/sign-up"
            className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-all hover:opacity-90 active:scale-[0.98]"
          >
            Get Started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-24 pb-20 text-center">
        <div className="animate-in-up">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-xs text-muted-foreground mb-8">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse-subtle" />
            AI-Powered Lead Generation
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.1] mb-6">
            <span className="gradient-text">Find leads.</span>
            <br />
            <span className="gradient-text">Enrich automatically.</span>
            <br />
            <span className="text-foreground">Close deals.</span>
          </h1>

          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
            Scrape Google Maps, LinkedIn, and Job Boards. AI finds decision maker emails,
            drafts personalized outreach, and calls your leads — all on autopilot.
          </p>

          <div className="flex items-center justify-center gap-4">
            <Link
              href="/sign-up"
              className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground transition-all hover:opacity-90 active:scale-[0.98] glow"
            >
              Start Scraping
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
            <Link
              href="/sign-in"
              className="inline-flex h-11 items-center justify-center rounded-lg border border-border bg-card px-6 text-sm font-medium text-foreground transition-all hover:bg-accent active:scale-[0.98]"
            >
              Sign In
            </Link>
          </div>
        </div>
      </section>

      {/* Feature Grid */}
      <section className="max-w-6xl mx-auto px-6 pb-24">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <FeatureCard
            icon={<Bot className="h-5 w-5" />}
            title="Autonomous Scraping"
            description="Set your ICP criteria and the agent scrapes Google Maps and LinkedIn automatically. No manual browsing."
          />
          <FeatureCard
            icon={<Target className="h-5 w-5" />}
            title="Decision Maker Discovery"
            description="Finds the CEO, owner, or founder — not just the info@ email. Scrapes team pages, Google, GitHub, and more."
          />
          <FeatureCard
            icon={<Zap className="h-5 w-5" />}
            title="Waterfall Enrichment"
            description="7+ data sources chained like Clay. Pattern generation, SMTP verification, Google dorking, social scraping."
          />
          <FeatureCard
            icon={<Mail className="h-5 w-5" />}
            title="AI Outreach"
            description="Claude or GPT drafts personalized emails using lead signals — reviews, tech stack, hiring data, pain points."
          />
          <FeatureCard
            icon={<Phone className="h-5 w-5" />}
            title="AI Voice Calls"
            description="Bland.ai calls your leads with a personalized script. Handles objections, drops voicemails, books meetings."
          />
          <FeatureCard
            icon={<Video className="h-5 w-5" />}
            title="AI Video Prospecting"
            description="HeyGen generates personalized video messages. 3-5x reply rate vs text-only cold emails."
          />
          <FeatureCard
            icon={<BarChart3 className="h-5 w-5" />}
            title="Lead Scoring + ICP"
            description="Auto-scores every lead against your ideal customer profile. Revenue estimation, freshness decay, urgency signals."
          />
          <FeatureCard
            icon={<Users className="h-5 w-5" />}
            title="Company Intelligence"
            description="Employee count, revenue estimate, hiring signals, tech stack, competitive intelligence, recent news — all automatic."
          />
          <FeatureCard
            icon={<Search className="h-5 w-5" />}
            title="MarkedUp Integration"
            description="Reports, analytics, call logs, and notifications push directly into your MarkedUp workspace."
          />
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="border-t border-border py-20">
        <div className="max-w-2xl mx-auto text-center px-6">
          <h2 className="text-3xl font-bold tracking-tight mb-4">
            Stop manually searching for leads.
          </h2>
          <p className="text-muted-foreground mb-8">
            Set your target, let the agent scrape, enrich, and start outreach — all while you focus on closing.
          </p>
          <Link
            href="/sign-up"
            className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground transition-all hover:opacity-90 active:scale-[0.98]"
          >
            Get Started Free
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="group rounded-xl border border-border bg-card p-5 transition-all duration-200 hover:border-foreground/10 hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/20">
      <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
        {icon}
      </div>
      <h3 className="text-sm font-semibold mb-1.5">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}

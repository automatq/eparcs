/**
 * LinkedIn Campaign Engine
 *
 * Processes campaign sequences:
 * 1. Finds prospects due for their next action
 * 2. Generates the action (with personalized message)
 * 3. Queues it for the extension to execute
 * 4. Updates prospect state after execution
 *
 * The extension polls /api/linkedin/actions for pending actions,
 * executes them on LinkedIn, and reports back results.
 */

import { db } from "@/lib/db";
import {
  personalizeMessage,
  ACCOUNT_LIMITS,
  type LinkedInAction,
  type ActionResult,
} from "./actions";

/**
 * Get the next batch of actions for the extension to execute.
 * Respects daily limits and timing.
 */
export async function getNextActions(ownerId: string): Promise<LinkedInAction[]> {
  const actions: LinkedInAction[] = [];

  // Get all active campaigns for this user
  const campaigns = await db.linkedInCampaign.findMany({
    where: { ownerId, status: "active" },
    include: {
      steps: { orderBy: { order: "asc" } },
      prospects: {
        where: {
          hasReplied: false,
          stage: { notIn: ["qualified_in", "qualified_out", "responded"] },
          nextActionAt: { lte: new Date() },
        },
        orderBy: { nextActionAt: "asc" },
        take: 10, // Process 10 at a time
      },
    },
  });

  // Get today's action counts to enforce daily limits
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayActionCount = await db.linkedInProspect.count({
    where: {
      campaign: { ownerId },
      lastActionAt: { gte: today },
    },
  });

  for (const campaign of campaigns) {
    const limits = ACCOUNT_LIMITS[campaign.accountType] ?? ACCOUNT_LIMITS.free;
    const totalDailyLimit = Math.min(campaign.dailyLimit, limits.visits);

    if (todayActionCount >= totalDailyLimit) break;

    for (const prospect of campaign.prospects) {
      if (actions.length + todayActionCount >= totalDailyLimit) break;

      const step = campaign.steps[prospect.currentStep];
      if (!step) {
        // No more steps — mark as completed
        await db.linkedInProspect.update({
          where: { id: prospect.id },
          data: { stage: "qualified_in" },
        });
        continue;
      }

      // Build the action
      let message: string | undefined;
      if (step.messageTemplate) {
        message = personalizeMessage(step.messageTemplate, {
          name: prospect.name,
          title: prospect.title,
          company: prospect.company,
        });
      }

      actions.push({
        id: `${prospect.id}-${step.id}`,
        type: step.action as any,
        prospectId: prospect.id,
        linkedinUrl: prospect.linkedinUrl,
        message,
        subject: step.action === "inmail" ? `Quick question, ${prospect.name.split(" ")[0]}` : undefined,
        tag: step.tag ?? undefined,
      });
    }
  }

  return actions;
}

/**
 * Process action results from the extension.
 * Updates prospect state and advances the campaign.
 */
export async function processActionResult(result: ActionResult): Promise<void> {
  const [prospectId] = result.actionId.split("-");

  const prospect = await db.linkedInProspect.findUnique({
    where: { id: prospectId },
    include: {
      campaign: {
        include: { steps: { orderBy: { order: "asc" } } },
      },
    },
  });

  if (!prospect) return;

  const steps = prospect.campaign.steps;
  const currentStep = steps[prospect.currentStep];

  if (!result.success) {
    // Action failed — don't advance, retry later
    await db.linkedInProspect.update({
      where: { id: prospectId },
      data: {
        nextActionAt: new Date(Date.now() + 60 * 60 * 1000), // Retry in 1 hour
      },
    });
    return;
  }

  // Update stage based on action type
  const stageMap: Record<string, string> = {
    visit: "visited",
    connect: "invited",
    message: "messaged",
    inmail: "messaged",
    endorse: prospect.stage, // Don't change stage for endorsements
    like: prospect.stage,
    follow: prospect.stage,
    tag: prospect.stage,
  };

  const newStage = stageMap[currentStep?.action ?? ""] ?? prospect.stage;

  // Update connection status if provided
  const connectionUpdate = result.connectionStatus
    ? { connectionStatus: result.connectionStatus }
    : {};

  // Handle "connected" status — update stage
  if (result.connectionStatus === "connected" && prospect.stage === "invited") {
    await db.linkedInProspect.update({
      where: { id: prospectId },
      data: { stage: "connected", ...connectionUpdate },
    });
  }

  // Advance to next step
  const nextStepIndex = prospect.currentStep + 1;
  const nextStep = steps[nextStepIndex];

  if (nextStep) {
    // Calculate when the next action should fire
    const nextActionAt = new Date(Date.now() + nextStep.delayHours * 60 * 60 * 1000);

    await db.linkedInProspect.update({
      where: { id: prospectId },
      data: {
        currentStep: nextStepIndex,
        stage: newStage !== prospect.stage ? newStage : prospect.stage,
        nextActionAt,
        lastActionAt: new Date(),
        ...connectionUpdate,
      },
    });
  } else {
    // Campaign complete for this prospect
    await db.linkedInProspect.update({
      where: { id: prospectId },
      data: {
        stage: newStage !== prospect.stage ? newStage : "qualified_in",
        lastActionAt: new Date(),
        nextActionAt: null,
        ...connectionUpdate,
      },
    });
  }

  // If action extracted data (from profile visit), save it
  if (result.extractedData && prospect.leadId) {
    const data = result.extractedData;
    await db.lead.update({
      where: { id: prospect.leadId },
      data: {
        ...(data.title && { title: data.title }),
        ...(data.company && { company: data.company }),
        ...(data.location && { location: data.location }),
      },
    }).catch(() => {});
  }
}

/**
 * Mark a prospect as having replied (pauses their campaign).
 */
export async function markProspectReplied(
  linkedinUrl: string,
  ownerId: string
): Promise<void> {
  await db.linkedInProspect.updateMany({
    where: {
      linkedinUrl,
      campaign: { ownerId },
      hasReplied: false,
    },
    data: {
      hasReplied: true,
      stage: "responded",
      nextActionAt: null,
    },
  });
}

/**
 * Get campaign funnel stats.
 */
export async function getCampaignStats(campaignId: string) {
  const prospects = await db.linkedInProspect.findMany({
    where: { campaignId },
  });

  return {
    total: prospects.length,
    enrolled: prospects.filter((p) => p.stage === "enrolled").length,
    visited: prospects.filter((p) => p.stage === "visited").length,
    invited: prospects.filter((p) => p.stage === "invited").length,
    connected: prospects.filter((p) => p.stage === "connected").length,
    messaged: prospects.filter((p) => p.stage === "messaged").length,
    responded: prospects.filter((p) => p.stage === "responded").length,
    qualifiedIn: prospects.filter((p) => p.stage === "qualified_in").length,
    qualifiedOut: prospects.filter((p) => p.stage === "qualified_out").length,
    hasReplied: prospects.filter((p) => p.hasReplied).length,
    connectionRate: prospects.length > 0
      ? (prospects.filter((p) => ["connected", "messaged", "responded", "qualified_in"].includes(p.stage)).length / prospects.length * 100).toFixed(1)
      : "0",
    responseRate: prospects.length > 0
      ? (prospects.filter((p) => p.hasReplied).length / prospects.length * 100).toFixed(1)
      : "0",
  };
}

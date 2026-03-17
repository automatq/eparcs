/**
 * Timezone-Aware Send Scheduler
 *
 * Schedules emails to arrive at optimal times in the recipient's timezone.
 * Best times: Tuesday-Thursday, 9-11am local time.
 */

/**
 * Calculate the optimal send time for a lead based on their location.
 */
export function getOptimalSendTime(location?: string | null): Date {
  const now = new Date();

  // Estimate timezone offset from location
  const tzOffset = estimateTimezoneOffset(location);

  // Target: next business day at 9:30 AM recipient local time
  const targetHour = 9;
  const targetMinute = 30;

  // Get current time in recipient's timezone
  const recipientNow = new Date(now.getTime() + tzOffset * 60 * 60 * 1000);
  const recipientHour = recipientNow.getUTCHours();
  const recipientDay = recipientNow.getUTCDay();

  let sendDate = new Date(now);

  // If it's already past 11am in their timezone, schedule for tomorrow
  if (recipientHour >= 11) {
    sendDate.setDate(sendDate.getDate() + 1);
  }

  // Skip weekends
  const sendDay = sendDate.getDay();
  if (sendDay === 0) sendDate.setDate(sendDate.getDate() + 1); // Sunday → Monday
  if (sendDay === 6) sendDate.setDate(sendDate.getDate() + 2); // Saturday → Monday

  // Set target time in UTC (adjusted for recipient's timezone)
  sendDate.setUTCHours(targetHour - tzOffset, targetMinute, 0, 0);

  // Add some randomness (±30 min) to avoid looking automated
  const jitter = Math.floor(Math.random() * 60 - 30) * 60 * 1000;
  sendDate = new Date(sendDate.getTime() + jitter);

  return sendDate;
}

/**
 * Estimate UTC offset from a location string.
 * Returns offset in hours (e.g., -5 for EST, +1 for CET).
 */
function estimateTimezoneOffset(location?: string | null): number {
  if (!location) return -5; // Default to EST

  const loc = location.toLowerCase();

  // US timezones
  if (/new york|nyc|boston|miami|florida|philadelphia|atlanta|washington|dc|virginia|carolina|georgia|maryland|new jersey|connecticut|maine|vermont/.test(loc)) return -5;
  if (/chicago|dallas|houston|austin|denver|minneapolis|milwaukee|nashville|memphis|kansas|oklahoma|iowa|wisconsin|illinois|indiana|texas|colorado/.test(loc)) return -6;
  if (/los angeles|san francisco|seattle|portland|phoenix|las vegas|california|oregon|washington state|nevada|arizona/.test(loc)) return -8;
  if (/hawaii/.test(loc)) return -10;

  // Canada
  if (/toronto|montreal|ottawa|ontario|quebec/.test(loc)) return -5;
  if (/vancouver|british columbia|alberta|calgary/.test(loc)) return -8;

  // Europe
  if (/london|uk|united kingdom|britain|ireland|dublin/.test(loc)) return 0;
  if (/paris|berlin|madrid|rome|amsterdam|brussels|stockholm|vienna|zurich|munich|milan/.test(loc)) return 1;
  if (/istanbul|helsinki|athens|bucharest|cairo/.test(loc)) return 2;

  // Asia
  if (/dubai|abu dhabi|uae/.test(loc)) return 4;
  if (/mumbai|delhi|bangalore|india/.test(loc)) return 5.5;
  if (/singapore|hong kong|beijing|shanghai|china/.test(loc)) return 8;
  if (/tokyo|japan|seoul|korea/.test(loc)) return 9;
  if (/sydney|melbourne|australia/.test(loc)) return 10;

  return -5; // Default EST
}

/**
 * Check if now is a good time to send (business hours in common US timezones).
 */
export function isGoodSendWindow(): boolean {
  const now = new Date();
  const estHour = now.getUTCHours() - 5;
  const day = now.getUTCDay();

  // Weekday 8am-5pm EST
  return day >= 1 && day <= 5 && estHour >= 8 && estHour <= 17;
}

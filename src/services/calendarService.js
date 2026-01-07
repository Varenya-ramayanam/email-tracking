const { google } = require('googleapis');

async function addToCalendar(auth, details) {
  const calendar = google.calendar({ version: 'v3', auth });
  
  try {
    // 1. Create a Date object from 'YYYY-MM-DD' and 'HH:mm'
    // Note: We use the local time constructor instead of forcing 'Z' (UTC) 
    // unless you specifically want UTC, to avoid timezone shifts.
    const startDateTime = new Date(`${details.date}T${details.time}:00`);

    if (isNaN(startDateTime.getTime())) {
      throw new Error(`Invalid Date/Time: ${details.date} ${details.time}`);
    }

    // 2. Default duration to 45 minutes
    const endDateTime = new Date(startDateTime.getTime() + 45 * 60000);

    const event = {
      summary: `Interview: ${details.company}`,
      location: 'Remote / See Email',
      description: details.description || 'Scheduled via Gemini AI',
      start: {
        dateTime: startDateTime.toISOString(), 
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      },
      end: {
        dateTime: endDateTime.toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 },
          { method: 'popup', minutes: 30 },
        ],
      },
    };

    console.log(`📅 Creating event for ${details.company}...`);

    const response = await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
    });

    return response.data;
  } catch (error) {
    console.error("❌ Calendar Service Error:", error.response?.data?.error || error.message);
    throw error;
  }
}

module.exports = { addToCalendar };
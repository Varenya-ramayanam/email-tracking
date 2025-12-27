const { google } = require('googleapis');

async function addToCalendar(auth, details) {
  const calendar = google.calendar({ version: 'v3', auth });
  
  try {
    // 1. Create a valid Start Date object
    // We assume details.date is 'YYYY-MM-DD' and details.time is 'HH:mm'
    const startDateTime = new Date(`${details.date}T${details.time}:00Z`);

    // 2. Check if the date is valid to prevent crashes
    if (isNaN(startDateTime.getTime())) {
      throw new Error(`Invalid Date or Time provided: ${details.date} ${details.time}`);
    }

    // 3. Calculate End Date (Start Time + 45 minutes)
    // 45 minutes = 45 * 60 * 1000 milliseconds
    const endDateTime = new Date(startDateTime.getTime() + 45 * 60000);

    const event = {
      summary: `Interview with ${details.company}`,
      description: details.description || 'Scheduled automatically via Job Application Processor',
      start: {
        dateTime: startDateTime.toISOString(), // Properly formatted ISO string
        timeZone: 'UTC',
      },
      end: {
        dateTime: endDateTime.toISOString(), // Properly formatted ISO string
        timeZone: 'UTC',
      },
      reminders: {
        useDefault: true,
      },
    };

    console.log(`Attempting to add event: ${event.summary} at ${event.start.dateTime}`);

    const response = await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
    });

    return response.data;
  } catch (error) {
    // Log specific details if it's a Google API error
    if (error.response && error.response.data) {
      console.error("Calendar API Detailed Error:", error.response.data.error);
    } else {
      console.error("Calendar Service Error:", error.message);
    }
    throw error;
  }
}

module.exports = { addToCalendar };
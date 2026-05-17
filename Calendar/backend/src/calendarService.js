import sampleCalendar from "./data/sampleCalendar.js";
import sampleEvents from "./data/sampleEvents.js";

const SAMPLE_SHARE_ID = sampleCalendar.capabilityId;
const CALENDAR_API = "https://api.calendar.online/calendar";
const EVENTS_API = "https://api.calendar.online/event";

function asApiDate(date) {
  const pad = (value) => String(value).padStart(2, "0");

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join("-") + ` ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function parseEventDate(value) {
  return new Date(value.replace(" ", "T"));
}

function filterSampleEvents(events, startDate, endDate) {
  const start = parseEventDate(startDate);
  const end = parseEventDate(endDate);

  return events.filter((event) => {
    const eventStart = parseEventDate(event.start_date);
    const eventEnd = parseEventDate(event.end_date);

    return eventStart <= end && eventEnd >= start;
  });
}

async function fetchJson(url) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(12000)
  });

  if (!response.ok) {
    throw new Error(`Upstream request failed with ${response.status}`);
  }

  const payload = await response.json();

  if (payload && payload.success === false) {
    throw new Error(payload.msg || "Upstream API returned an error");
  }

  return payload;
}

export async function getCalendar(shareId) {
  try {
    const payload = await fetchJson(`${CALENDAR_API}?capabilityId=${encodeURIComponent(shareId)}`);
    return {
      source: "live",
      data: payload
    };
  } catch (error) {
    if (shareId === SAMPLE_SHARE_ID) {
      return {
        source: "fixture",
        data: sampleCalendar
      };
    }

    throw error;
  }
}

export async function getEvents(shareId, { startDate, endDate, timeZone }) {
  try {
    const params = new URLSearchParams({
      capabilityId: shareId,
      startDate,
      endDate,
      timeZone: timeZone || "America/Los_Angeles"
    });

    const payload = await fetchJson(`${EVENTS_API}?${params.toString()}`);

    return {
      source: "live",
      data: payload
    };
  } catch (error) {
    if (shareId === SAMPLE_SHARE_ID) {
      return {
        source: "fixture",
        data: filterSampleEvents(sampleEvents, startDate, endDate)
      };
    }

    throw error;
  }
}

export function getDefaultRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  return {
    startDate: asApiDate(start),
    endDate: asApiDate(end)
  };
}

import { useEffect, useMemo, useState } from "react";

const DEFAULT_SHARE_URL = "https://calendar.online/ec52dc9ed413134fcc88";

function parseShareId(value) {
  if (!value) {
    return "";
  }

  try {
    const url = new URL(value);
    const [firstSegment] = url.pathname.split("/").filter(Boolean);
    return firstSegment || "";
  } catch {
    return value.trim().replace(/^\/+|\/+$/g, "");
  }
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function toApiDate(date, endOfDay = false) {
  const normalized = new Date(date);

  if (endOfDay) {
    normalized.setHours(23, 59, 59, 0);
  } else {
    normalized.setHours(0, 0, 0, 0);
  }

  return `${normalized.getFullYear()}-${pad(normalized.getMonth() + 1)}-${pad(normalized.getDate())} ${pad(normalized.getHours())}:${pad(normalized.getMinutes())}:${pad(normalized.getSeconds())}`;
}

function parseEventDate(value) {
  return new Date(value.replace(" ", "T"));
}

function formatMonthLabel(date, timeZone) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone
  }).format(date);
}

function formatDayLabel(date, timeZone) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone
  }).format(date);
}

function formatEventTime(value, timeZone) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone
  }).format(parseEventDate(value));
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function buildMonthGrid(date, firstWeekday) {
  const monthStart = startOfMonth(date);
  const monthEnd = endOfMonth(date);
  const leading = (monthStart.getDay() - firstWeekday + 7) % 7;
  const firstCell = new Date(monthStart);
  firstCell.setDate(monthStart.getDate() - leading);

  const trailing = 41 - ((monthEnd - firstCell) / 86400000);
  const lastCell = new Date(monthEnd);
  lastCell.setDate(monthEnd.getDate() + trailing);

  const days = [];
  const cursor = new Date(firstCell);

  while (cursor <= lastCell) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return days;
}

function colorForEvent(event, metadata) {
  const firstSubCalendarId = event.subCalendars?.[0];
  return metadata?.subCalendars.find((item) => item.id === firstSubCalendarId)?.color || "#5575a7";
}

export default function App() {
  const initialShareId = parseShareId(DEFAULT_SHARE_URL);

  const [shareInput, setShareInput] = useState(DEFAULT_SHARE_URL);
  const [shareId, setShareId] = useState(initialShareId);
  const [metadata, setMetadata] = useState(null);
  const [events, setEvents] = useState([]);
  const [error, setError] = useState("");
  const [isLoadingMeta, setIsLoadingMeta] = useState(true);
  const [isLoadingEvents, setIsLoadingEvents] = useState(true);
  const [currentView, setCurrentView] = useState("month");
  const [currentMonth, setCurrentMonth] = useState(new Date(2026, 4, 1));
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeSubCalendars, setActiveSubCalendars] = useState(new Set());

  useEffect(() => {
    let cancelled = false;

    async function loadCalendar() {
      setIsLoadingMeta(true);
      setError("");

      try {
        const response = await fetch(`/api/calendars/${shareId}`);
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.message || "Failed to load calendar");
        }

        if (!cancelled) {
          setMetadata(payload.data);
          setActiveSubCalendars(new Set(payload.data.subCalendars.map((item) => item.id)));
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingMeta(false);
        }
      }
    }

    loadCalendar();

    return () => {
      cancelled = true;
    };
  }, [shareId]);

  useEffect(() => {
    if (!metadata) {
      return;
    }

    let cancelled = false;

    async function loadEvents() {
      setIsLoadingEvents(true);

      const monthStart = startOfMonth(currentMonth);
      const monthEnd = endOfMonth(currentMonth);
      const params = new URLSearchParams({
        startDate: toApiDate(monthStart),
        endDate: toApiDate(monthEnd, true),
        timeZone: metadata.timeZone
      });

      try {
        const response = await fetch(`/api/calendars/${shareId}/events?${params.toString()}`);
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.message || "Failed to load events");
        }

        if (!cancelled) {
          setEvents(payload.data);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingEvents(false);
        }
      }
    }

    loadEvents();

    return () => {
      cancelled = true;
    };
  }, [shareId, metadata, currentMonth]);

  const gridDays = useMemo(() => {
    if (!metadata) {
      return [];
    }

    return buildMonthGrid(currentMonth, metadata.firstWeekday ?? 0);
  }, [currentMonth, metadata]);

  const visibleEvents = useMemo(() => {
    return events
      .filter((event) => {
        const matchesSearch = searchTerm.trim() === "" || [
          event.title,
          event.text,
          event.who,
          event.where
        ].join(" ").toLowerCase().includes(searchTerm.toLowerCase());

        const matchesCalendar = event.subCalendars?.some((id) => activeSubCalendars.has(id));

        return matchesSearch && matchesCalendar;
      })
      .sort((left, right) => parseEventDate(left.start_date) - parseEventDate(right.start_date));
  }, [activeSubCalendars, events, searchTerm]);

  const eventsByDay = useMemo(() => {
    const grouped = new Map();

    for (const event of visibleEvents) {
      const date = event.start_date.slice(0, 10);
      const bucket = grouped.get(date) || [];
      bucket.push(event);
      grouped.set(date, bucket);
    }

    return grouped;
  }, [visibleEvents]);

  const agendaGroups = useMemo(() => {
    return Array.from(eventsByDay.entries()).map(([day, dayEvents]) => ({
      day,
      date: parseEventDate(`${day} 00:00:00`),
      events: dayEvents
    }));
  }, [eventsByDay]);

  function submitShareId(event) {
    event.preventDefault();
    const nextShareId = parseShareId(shareInput);

    if (nextShareId) {
      setShareId(nextShareId);
      setSelectedEvent(null);
    }
  }

  function toggleSubCalendar(id) {
    setActiveSubCalendars((current) => {
      const next = new Set(current);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  }

  if (isLoadingMeta && !metadata) {
    return <div className="page-shell centered">Loading calendar…</div>;
  }

  return (
    <div className="page-shell">
      <header className="hero">
        <div className="hero-title-block">
          <h1>{metadata?.title || "Shared calendar"}</h1>
          <div className="hero-meta-line">
            <span>{shareId}</span>
            <span>{metadata?.timeZone}</span>
            <span>{visibleEvents.length} events</span>
          </div>
        </div>

        <form className="share-form" onSubmit={submitShareId}>
          <label htmlFor="share-link">Share link</label>
          <div className="share-row">
            <input
              id="share-link"
              value={shareInput}
              onChange={(event) => setShareInput(event.target.value)}
              placeholder="https://calendar.online/..."
            />
            <button type="submit">Load</button>
          </div>
        </form>
      </header>

      {error ? <div className="error-banner">{error}</div> : null}

      <main className="app-frame">
        <aside className="sidebar">
          <section className="panel">
            <div className="panel-title-row">
              <h2>Calendar</h2>
              <span className="pill">{metadata?.timeZone}</span>
            </div>
            <div className="meta-grid">
              <div>
                <span className="meta-label">Share ID</span>
                <strong>{shareId}</strong>
              </div>
              <div>
                <span className="meta-label">Default view</span>
                <strong>Month</strong>
              </div>
              <div>
                <span className="meta-label">Events this range</span>
                <strong>{visibleEvents.length}</strong>
              </div>
              <div>
                <span className="meta-label">iCal</span>
                <a href={metadata?.ics} target="_blank" rel="noreferrer">
                  Open feed
                </a>
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-title-row">
              <h2>Sub-calendars</h2>
              <button
                className="ghost-button"
                type="button"
                onClick={() => setActiveSubCalendars(new Set(metadata.subCalendars.map((item) => item.id)))}
              >
                Reset
              </button>
            </div>

            <div className="legend-list">
              {metadata?.subCalendars.map((subCalendar) => {
                const isActive = activeSubCalendars.has(subCalendar.id);

                return (
                  <button
                    className={`legend-item ${isActive ? "legend-item-active" : ""}`}
                    key={subCalendar.id}
                    type="button"
                    onClick={() => toggleSubCalendar(subCalendar.id)}
                    style={{
                      "--legend-color": subCalendar.color
                    }}
                  >
                    <span className="legend-swatch" />
                    <span>{subCalendar.name}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="panel">
            <div className="panel-title-row">
              <h2>Filters</h2>
            </div>
            <input
              className="search-input"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search title, notes, person or place"
            />
          </section>
        </aside>

        <section className="calendar-stage">
          <div className="toolbar">
            <div className="nav-group">
              <button type="button" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}>
                Prev
              </button>
              <button type="button" onClick={() => setCurrentMonth(new Date(2026, 4, 1))}>
                May 2026
              </button>
              <button type="button" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}>
                Next
              </button>
            </div>

            <div className="toolbar-title">
              <h2>{formatMonthLabel(currentMonth, metadata?.timeZone || "UTC")}</h2>
              <span>{isLoadingEvents ? "Refreshing…" : `${visibleEvents.length} visible events`}</span>
            </div>

            <div className="view-switcher">
              <button
                type="button"
                className={currentView === "month" ? "is-active" : ""}
                onClick={() => setCurrentView("month")}
              >
                Month
              </button>
              <button
                type="button"
                className={currentView === "agenda" ? "is-active" : ""}
                onClick={() => setCurrentView("agenda")}
              >
                Agenda
              </button>
            </div>
          </div>

          {currentView === "month" ? (
            <div className="month-grid">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => (
                <div className="month-grid-header" key={label}>
                  {label}
                </div>
              ))}

              {gridDays.map((day) => {
                const key = day.toISOString().slice(0, 10);
                const dayEvents = eventsByDay.get(key) || [];
                const isCurrentMonth = day.getMonth() === currentMonth.getMonth();

                return (
                  <article className={`day-card ${isCurrentMonth ? "" : "day-card-muted"}`} key={key}>
                    <div className="day-card-header">
                      <span>{day.getDate()}</span>
                      {dayEvents.length > 0 ? <small>{dayEvents.length}</small> : null}
                    </div>
                    <div className="day-card-events">
                      {dayEvents.map((event) => (
                        <button
                          key={event.id}
                          className="event-chip"
                          type="button"
                          onClick={() => setSelectedEvent(event)}
                          style={{
                            "--event-color": colorForEvent(event, metadata)
                          }}
                        >
                          <strong>{formatEventTime(event.start_date, metadata.timeZone)}</strong>
                          <span>{event.title}</span>
                        </button>
                      ))}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="agenda-list">
              {agendaGroups.map((group) => (
                <section className="agenda-day" key={group.day}>
                  <div className="agenda-day-title">{formatDayLabel(group.date, metadata.timeZone)}</div>
                  <div className="agenda-day-events">
                    {group.events.map((event) => (
                      <button
                        key={event.id}
                        className="agenda-event"
                        type="button"
                        onClick={() => setSelectedEvent(event)}
                      >
                        <span
                          className="agenda-event-bar"
                          style={{ backgroundColor: colorForEvent(event, metadata) }}
                        />
                        <div>
                          <div className="agenda-event-time">
                            {formatEventTime(event.start_date, metadata.timeZone)} - {formatEventTime(event.end_date, metadata.timeZone)}
                          </div>
                          <div className="agenda-event-title">{event.title}</div>
                          {(event.who || event.where) ? (
                            <div className="agenda-event-meta">{[event.who, event.where].filter(Boolean).join(" · ")}</div>
                          ) : null}
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </section>

        <aside className="details-pane">
          <section className="panel details-panel">
            <div className="panel-title-row">
              <h2>Event details</h2>
              {selectedEvent ? (
                <button className="ghost-button" type="button" onClick={() => setSelectedEvent(null)}>
                  Clear
                </button>
              ) : null}
            </div>

            {selectedEvent ? (
              <>
                <div
                  className="details-accent"
                  style={{ backgroundColor: colorForEvent(selectedEvent, metadata) }}
                />
                <h3>{selectedEvent.title}</h3>
                <p className="details-time">
                  {formatDayLabel(parseEventDate(selectedEvent.start_date), metadata.timeZone)} ·{" "}
                  {formatEventTime(selectedEvent.start_date, metadata.timeZone)} -{" "}
                  {formatEventTime(selectedEvent.end_date, metadata.timeZone)}
                </p>
                {selectedEvent.who ? <p><strong>Who:</strong> {selectedEvent.who}</p> : null}
                {selectedEvent.where ? <p><strong>Where:</strong> {selectedEvent.where}</p> : null}
                {selectedEvent.text ? <p className="details-copy">{selectedEvent.text}</p> : null}
              </>
            ) : (
              <p className="empty-state">Select an event.</p>
            )}
          </section>
        </aside>
      </main>
    </div>
  );
}

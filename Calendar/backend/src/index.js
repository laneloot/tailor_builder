import cors from "cors";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getCalendar, getDefaultRange, getEvents } from "./calendarService.js";

const app = express();
const port = Number(process.env.PORT || 3001);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDist = path.resolve(__dirname, "../../frontend/dist");

app.use(cors());
app.use(express.json());

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true
  });
});

app.get("/api/calendars/:shareId", async (request, response) => {
  try {
    const result = await getCalendar(request.params.shareId);

    response.json(result);
  } catch (error) {
    response.status(502).json({
      message: error.message
    });
  }
});

app.get("/api/calendars/:shareId/events", async (request, response) => {
  const { startDate, endDate } = request.query.startDate && request.query.endDate
    ? {
        startDate: String(request.query.startDate),
        endDate: String(request.query.endDate)
      }
    : getDefaultRange();

  try {
    const result = await getEvents(request.params.shareId, {
      startDate,
      endDate,
      timeZone: request.query.timeZone ? String(request.query.timeZone) : undefined
    });

    response.json({
      ...result,
      range: {
        startDate,
        endDate
      }
    });
  } catch (error) {
    response.status(502).json({
      message: error.message
    });
  }
});

app.use(express.static(frontendDist));

app.get("*", (request, response, next) => {
  if (request.path.startsWith("/api/")) {
    return next();
  }

  response.sendFile(path.join(frontendDist, "index.html"), (error) => {
    if (error) {
      response
        .status(404)
        .json({ message: "Build the frontend or run the Vite dev server for the client UI." });
    }
  });
});

app.listen(port, () => {
  console.log(`Calendar clone backend listening on http://localhost:${port}`);
});

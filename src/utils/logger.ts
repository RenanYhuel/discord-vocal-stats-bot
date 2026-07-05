import fs from "fs";
import path from "path";
import db from "../database/db";
import { systemLogs } from "../database/schema";

const LOG_DIR = path.join(__dirname, "../../logs");
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR);
}

function writeLog(level: "info" | "warn" | "error", message: string, obj: unknown = null): void {
  const timestamp = new Date().toISOString();
  const cleanObj = obj instanceof Error ? { message: obj.message, stack: obj.stack } : obj;
  const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}${cleanObj ? " " + JSON.stringify(cleanObj) : ""}\n`;
  
  if (level === "error") {
    console.error(logMessage.trim());
    fs.appendFileSync(path.join(LOG_DIR, "error.log"), logMessage);
  } else {
    console.log(logMessage.trim());
  }
  fs.appendFileSync(path.join(LOG_DIR, "bot.log"), logMessage);
  
  try {
    db.insert(systemLogs).values({
      timestamp,
      level,
      message,
      details: cleanObj ? JSON.stringify(cleanObj) : null
    }).run();
  } catch (err) {
    if (err instanceof Error) {
      console.error("Impossible d'écrire le log système en DB : ", err.message);
    }
  }
}

export default {
  info: (message: string, obj: unknown = null) => writeLog("info", message, obj),
  warn: (message: string, obj: unknown = null) => writeLog("warn", message, obj),
  error: (message: string, obj: unknown = null) => writeLog("error", message, obj)
};

import express from "express";
import path from "path";

const app = express();
const __dirname = process.cwd();

// Serve everything in static
app.use("/static", express.static(path.join(__dirname, "static")));

// Optional: redirect root "/" to index.html
app.use(express.static(path.join(__dirname, "public")));

export default app;

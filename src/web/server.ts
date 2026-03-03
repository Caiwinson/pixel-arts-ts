import express from "express";
import path from "path";
import imageRouter from "./routes/image.js";
import videoRouter from "./routes/video.js";
import voteRouter from "./routes/vote.js";

const app = express();
const __dirname = process.cwd();

app.use("/static", express.static(path.join(__dirname, "static")));
app.use(express.static(path.join(__dirname, "public")));

app.use("/", imageRouter);
app.use("/", videoRouter);
app.use("/", voteRouter)

app.get("/timelapse/:code", (req, res) => {
    // Serve timelapse.html from ./public
    res.sendFile(path.join(__dirname, "public", "timelapse.html"));
});

// Catch-all to debug unmatched routes
app.use((req, res) => {
    console.log("Unmatched route:", req.method, req.path);
    res.status(404).send("Not found");
});

export default app;
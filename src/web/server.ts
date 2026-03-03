import express from "express";
import path from "path";
import imageRouter from "./routes/image.js";
import videoRouter from "./routes/video.js";

const app = express();
const __dirname = process.cwd();

app.use("/static", express.static(path.join(__dirname, "static")));
app.use(express.static(path.join(__dirname, "public")));

app.use("/", imageRouter);
app.use("/", videoRouter);

// Catch-all to debug unmatched routes
app.use((req, res) => {
    console.log("Unmatched route:", req.method, req.path);
    res.status(404).send("Not found");
});

export default app;